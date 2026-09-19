package com.gridline.app;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Component
public class ResponderStore {

    // Demo fleet, staged at the real stations that actually cover
    // Blacksburg, VA. Positions are lat/lng.
    private final List<Responder> responders = new ArrayList<>(List.of(
        // Blacksburg Volunteer Rescue Squad — 1300 Progress St NW
        new Responder("M-04", "medical", 37.23670, -80.42410),
        // LewisGale Hospital Montgomery — 3700 S Main St (posted as a second medical unit)
        new Responder("M-11", "medical", 37.18660, -80.40920),
        // Blacksburg Volunteer Fire Dept — 407 Hubbard St
        new Responder("F-02", "fire", 37.22650, -80.41800),
        // Substation posted north of town near Patrick Henry Dr
        new Responder("F-07", "fire", 37.24500, -80.41900),
        // Blacksburg Police Dept — 200 Clay St NE
        new Responder("P-16", "police", 37.23120, -80.41160),
        // Patrol unit posted near Prices Fork Rd / Southgate Dr
        new Responder("P-19", "police", 37.22600, -80.42700)
    ));

    public synchronized List<Responder> all() {
        return new ArrayList<>(responders);
    }

    // Scores available responders of the matching type by straight-line
    // (haversine) distance and returns the closest one, marking it busy.
    // Actual driving distance/ETA for the map animation is computed
    // client-side against the real road network.
    public synchronized Optional<Responder> dispatchNearest(String type, double targetLat, double targetLng) {
        Responder best = null;
        double bestDist = Double.MAX_VALUE;
        for (Responder r : responders) {
            if (!r.type.equals(type) || r.busy) continue;
            double d = GeoUtil.haversineKm(r.lat, r.lng, targetLat, targetLng);
            if (d < bestDist) {
                bestDist = d;
                best = r;
            }
        }
        if (best == null) return Optional.empty();
        best.busy = true;
        return Optional.of(best);
    }

    // Called once the frontend's animation finishes, so the unit
    // actually arrives at the destination and frees up for the next call.
    public synchronized boolean arrive(String unitId, double lat, double lng) {
        for (Responder r : responders) {
            if (r.id.equals(unitId)) {
                r.lat = lat;
                r.lng = lng;
                r.busy = false;
                return true;
            }
        }
        return false;
    }
}
