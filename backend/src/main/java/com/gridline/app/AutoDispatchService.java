package com.gridline.app;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

// DispatchController deliberately never auto-assigns — a human always picks
// which unit responds. This service is for the two callers that aren't a
// human clicking checkboxes: the ElevenLabs live-call tool (the AI operator
// committing a unit mid-conversation) and the post-call webhook fallback,
// which makes sure a real call always results in a unit moving even if the
// live tool was never invoked or configured.
@Service
public class AutoDispatchService {

    private static final double AVG_URBAN_SPEED_KMH = 40.0;

    private final IntersectionRegistry intersections;
    private final ResponderStore responders;
    private final CoverageService coverage;

    public AutoDispatchService(IntersectionRegistry intersections, ResponderStore responders, CoverageService coverage) {
        this.intersections = intersections;
        this.responders = responders;
        this.coverage = coverage;
    }

    public static class Result {
        public final DispatchDtos.UnitDispatch unit;
        public final List<DispatchDtos.CoverageDirective> coverage;

        public Result(DispatchDtos.UnitDispatch unit, List<DispatchDtos.CoverageDirective> coverage) {
            this.unit = unit;
            this.coverage = coverage;
        }
    }

    // True once any unit is already committed to this call code — checked
    // before auto-dispatching so this never doubles up on a human dispatcher
    // (or an earlier tool call) that already sent someone.
    public boolean alreadyHasUnit(String code) {
        if (code == null) return false;
        String upper = code.trim().toUpperCase();
        return responders.all().stream().anyMatch(r -> upper.equals(r.assignedCallCode));
    }

    // Finds the nearest available unit of `type` ("police" | "fire" |
    // "medical") to the call at `code`, commits it exactly the way a human
    // dispatch would, and returns what got sent. Empty if the type is
    // unrecognized, nothing is free, a race lost the unit to someone else,
    // or a unit is already on this call.
    public synchronized Optional<Result> dispatchNearestAvailable(String code, String type) {
        if (code == null || code.isBlank() || type == null || type.isBlank()) return Optional.empty();
        if (alreadyHasUnit(code)) return Optional.empty();

        Intersection target = intersections.resolve(code);

        Responder nearest = null;
        double bestDist = Double.MAX_VALUE;
        for (Responder r : responders.all()) {
            if (r.isBusy() || !type.equalsIgnoreCase(r.type)) continue;
            double dist = GeoUtil.haversineKm(r.lat, r.lng, target.lat, target.lng);
            if (dist < bestDist) {
                bestDist = dist;
                nearest = r;
            }
        }
        if (nearest == null) return Optional.empty();

        Optional<Responder> committed = responders.dispatchSpecific(nearest.id, target.code);
        if (committed.isEmpty()) return Optional.empty(); // lost a race to someone else
        Responder unit = committed.get();

        double distKm = GeoUtil.haversineKm(unit.lat, unit.lng, target.lat, target.lng);
        int etaMinutes = Math.max(1, (int) Math.round((distKm / AVG_URBAN_SPEED_KMH) * 60));
        DispatchDtos.UnitDispatch dispatch = new DispatchDtos.UnitDispatch(
            unit.id, unit.callsign, unit.type, unit.lat, unit.lng,
            target.lat, target.lng, target.code, target.name, etaMinutes
        );

        List<DispatchDtos.CoverageDirective> directives = coverage.planCoverage(List.of(unit), responders.all());
        return Optional.of(new Result(dispatch, directives));
    }
}
