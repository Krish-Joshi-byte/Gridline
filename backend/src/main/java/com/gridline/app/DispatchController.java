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

    public DispatchController(IntersectionRegistry intersections, ResponderStore responders) {
        this.intersections = intersections;
        this.responders = responders;
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
        List<String> errors = new ArrayList<>();

        for (String unitId : req.unitIds) {
            Optional<Responder> assigned = responders.dispatchSpecific(unitId);
            if (assigned.isEmpty()) {
                errors.add(unitId + " is no longer available");
                continue;
            }
            Responder unit = assigned.get();
            double distKm = GeoUtil.haversineKm(unit.lat, unit.lng, target.lat, target.lng);
            int etaMinutes = Math.max(1, (int) Math.round((distKm / AVG_URBAN_SPEED_KMH) * 60));
            dispatched.add(new DispatchDtos.UnitDispatch(
                unit.id, unit.type, unit.lat, unit.lng, target.lat, target.lng, target.code, target.name, etaMinutes
            ));
        }

        if (dispatched.isEmpty()) {
            return ResponseEntity.status(409).body(Map.of("error", "none of the selected units are available", "details", errors));
        }

        return ResponseEntity.ok(new DispatchDtos.DispatchResult(dispatched, errors));
    }

    @PostMapping("/dispatch/{unitId}/arrive")
    public ResponseEntity<?> arrive(@PathVariable String unitId, @RequestBody DispatchDtos.ArriveRequest req) {
        boolean found = responders.arrive(unitId, req.lat, req.lng);
        if (!found) return ResponseEntity.status(404).body(Map.of("error", "unknown unit"));
        return ResponseEntity.ok(Map.of("freed", true));
    }
}
