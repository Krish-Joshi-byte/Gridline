package com.gridline.app;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

// The demo fleet. Units are built from resources/gridline/fleet.json and start
// the shift parked at their real home station; what they do from there is
// decided by the beat they are assigned (patrol loop, post rotation, or sitting
// in quarters).
@Component
public class ResponderStore {

    private final List<Responder> responders = new ArrayList<>();
    private final BeatRegistry beats;

    public ResponderStore(ObjectMapper mapper, StationRegistry stations, BeatRegistry beats) throws IOException {
        this.beats = beats;
        try (InputStream in = new ClassPathResource("gridline/fleet.json").getInputStream()) {
            FleetFile file = mapper.readValue(in, FleetFile.class);
            List<FleetUnit> units = file.units == null ? List.of() : file.units;
            for (FleetUnit unit : units) {
                Station home = stations.byId(unit.homeStationId).orElse(null);
                double lat = home != null ? home.lat : IntersectionRegistry.CENTER_LAT;
                double lng = home != null ? home.lng : IntersectionRegistry.CENTER_LNG;
                responders.add(new Responder(unit, initialStatus(unit), lat, lng));
            }
        }
    }

    // Where a unit starts the shift: cruisers roll out onto their beat, medics
    // go to their first post, engines stay in quarters.
    private String initialStatus(FleetUnit unit) {
        Beat beat = beats.byId(unit.beatId).orElse(null);
        if (beat == null) return UnitStatus.IN_QUARTERS;
        return switch (beat.mode == null ? "" : beat.mode) {
            case "PATROL_LOOP" -> UnitStatus.PATROLLING;
            case "POST_ROTATION" -> UnitStatus.POSTED;
            default -> UnitStatus.IN_QUARTERS;
        };
    }

    public synchronized List<Responder> all() {
        return new ArrayList<>(responders);
    }

    public synchronized Optional<Responder> byId(String unitId) {
        for (Responder r : responders) {
            if (r.id.equals(unitId)) return Optional.of(r);
        }
        return Optional.empty();
    }

    // Marks a specific, dispatcher-chosen unit committed and returns it — no
    // auto-assignment. Fails if the unit doesn't exist or is already on a call,
    // so a race between two dispatchers (or a stale UI) can't double-book it.
    public synchronized Optional<Responder> dispatchSpecific(String unitId, String callCode) {
        for (Responder r : responders) {
            if (r.id.equals(unitId)) {
                if (r.isBusy()) return Optional.empty();
                r.status = UnitStatus.EN_ROUTE;
                r.assignedCallCode = callCode;
                r.updatedAt = System.currentTimeMillis();
                return Optional.of(r);
            }
        }
        return Optional.empty();
    }

    // Called when the client's travel animation finishes: the unit is now
    // working the call and stays committed until the dispatcher clears it.
    public synchronized boolean arrive(String unitId, double lat, double lng) {
        for (Responder r : responders) {
            if (r.id.equals(unitId)) {
                r.lat = lat;
                r.lng = lng;
                r.status = UnitStatus.ON_SCENE;
                r.updatedAt = System.currentTimeMillis();
                return true;
            }
        }
        return false;
    }

    // Back in service. The unit is available again from wherever it is standing;
    // the client then drives it back to its beat, post, or quarters.
    public synchronized boolean clear(String unitId, Double lat, Double lng) {
        for (Responder r : responders) {
            if (r.id.equals(unitId)) {
                if (lat != null && lng != null) {
                    r.lat = lat;
                    r.lng = lng;
                }
                r.status = UnitStatus.RETURNING;
                r.assignedCallCode = null;
                r.updatedAt = System.currentTimeMillis();
                return true;
            }
        }
        return false;
    }

    // Position/status heartbeat from the client's patrol simulation. A committed
    // unit is ignored here: dispatch owns its state until it is cleared, so a
    // late heartbeat can't quietly put a unit back on patrol mid-call.
    public synchronized boolean updatePosition(String unitId, double lat, double lng, String status) {
        for (Responder r : responders) {
            if (r.id.equals(unitId)) {
                if (r.isBusy()) return false;
                r.lat = lat;
                r.lng = lng;
                if (status != null && !status.isBlank()) r.status = status;
                r.updatedAt = System.currentTimeMillis();
                return true;
            }
        }
        return false;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FleetFile {
        public String note;
        public List<FleetUnit> units;
    }
}
