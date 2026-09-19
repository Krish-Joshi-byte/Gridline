package com.gridline.app;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
public class DispatchController {

    private static final double AVG_URBAN_SPEED_KMH = 40.0;

    private final IntersectionRegistry intersections;
    private final ResponderStore responders;
    private final CoverageService coverage;

    public DispatchController(IntersectionRegistry intersections, ResponderStore responders, CoverageService coverage) {
        this.intersections = intersections;
        this.responders = responders;
        this.coverage = coverage;
    }

    // The dispatcher picks exactly which unit(s) — and how many — respond.
    // This endpoint never auto-assigns; it only commits the units named
    // in the request, so the caller stays in control of the response.
    @PostMapping("/dispatch")
    public ResponseEntity<?> dispatch(@RequestBody DispatchDtos.DispatchRequest req) {
        if (req.code == null || req.code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "code is required"));
        }
        if (req.unitIds == null || req.unitIds.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "select at least one unit to dispatch"));
        }

        Intersection target = intersections.resolve(req.code);
        List<DispatchDtos.UnitDispatch> dispatched = new ArrayList<>();
        List<Responder> committed = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (String unitId : req.unitIds) {
            Optional<Responder> assigned = responders.dispatchSpecific(unitId, target.code);
            if (assigned.isEmpty()) {
                errors.add(unitId + " is no longer available");
                continue;
            }
            Responder unit = assigned.get();
            committed.add(unit);

            // Measured from where the unit actually is right now — mid-beat,
            // at a post, or in quarters — not from its start-of-shift station.
            double distKm = GeoUtil.haversineKm(unit.lat, unit.lng, target.lat, target.lng);
            int etaMinutes = Math.max(1, (int) Math.round((distKm / AVG_URBAN_SPEED_KMH) * 60));
            dispatched.add(new DispatchDtos.UnitDispatch(
                unit.id, unit.callsign, unit.type, unit.lat, unit.lng,
                target.lat, target.lng, target.code, target.name, etaMinutes
            ));
        }

        if (dispatched.isEmpty()) {
            return ResponseEntity.status(409).body(Map.of("error", "none of the selected units are available", "details", errors));
        }

        List<DispatchDtos.CoverageDirective> directives = coverage.planCoverage(committed, responders.all());
        return ResponseEntity.ok(new DispatchDtos.DispatchResult(dispatched, errors, directives));
    }

    @PostMapping("/dispatch/{unitId}/arrive")
    public ResponseEntity<?> arrive(@PathVariable String unitId, @RequestBody DispatchDtos.ArriveRequest req) {
        boolean found = responders.arrive(unitId, req.lat, req.lng);
        if (!found) return ResponseEntity.status(404).body(Map.of("error", "unknown unit"));
        return ResponseEntity.ok(Map.of("status", UnitStatus.ON_SCENE));
    }

    // Back in service. Until this is called the unit stays committed, which is
    // why arriving on scene no longer silently frees it up.
    @PostMapping("/dispatch/{unitId}/clear")
    public ResponseEntity<?> clear(@PathVariable String unitId,
                                   @RequestBody(required = false) DispatchDtos.ClearRequest req) {
        Double lat = req == null ? null : req.lat;
        Double lng = req == null ? null : req.lng;
        boolean found = responders.clear(unitId, lat, lng);
        if (!found) return ResponseEntity.status(404).body(Map.of("error", "unknown unit"));
        return ResponseEntity.ok(Map.of("freed", true, "status", UnitStatus.RETURNING));
    }
}
