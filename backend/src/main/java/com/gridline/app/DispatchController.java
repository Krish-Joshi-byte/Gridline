package com.gridline.app;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*") // demo only — restrict to your frontend's origin before this ships anywhere real
public class DispatchController {

    private static final double AVG_URBAN_SPEED_KMH = 40.0;

    private final IntersectionRegistry intersections;
    private final ResponderStore responders;

    public DispatchController(IntersectionRegistry intersections, ResponderStore responders) {
        this.intersections = intersections;
        this.responders = responders;
    }

    @PostMapping("/dispatch")
    public ResponseEntity<?> dispatch(@RequestBody DispatchDtos.DispatchRequest req) {
        if (req.code == null || req.code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "code is required"));
        }
        if (req.type == null || req.type.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "type is required"));
        }

        Intersection target = intersections.resolve(req.code);
        Optional<Responder> assigned = responders.dispatchNearest(req.type, target.lat, target.lng);

        if (assigned.isEmpty()) {
            return ResponseEntity.status(409).body(Map.of("error", "no " + req.type + " units free right now"));
        }

        Responder unit = assigned.get();
        double distKm = GeoUtil.haversineKm(unit.lat, unit.lng, target.lat, target.lng);
        int etaMinutes = Math.max(1, (int) Math.round((distKm / AVG_URBAN_SPEED_KMH) * 60));

        DispatchDtos.DispatchResponse resp = new DispatchDtos.DispatchResponse(
            unit.id, unit.type, unit.lat, unit.lng, target.lat, target.lng, target.code, target.name, etaMinutes
        );
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/dispatch/{unitId}/arrive")
    public ResponseEntity<?> arrive(@PathVariable String unitId, @RequestBody DispatchDtos.ArriveRequest req) {
        boolean found = responders.arrive(unitId, req.lat, req.lng);
        if (!found) return ResponseEntity.status(404).body(Map.of("error", "unknown unit"));
        return ResponseEntity.ok(Map.of("freed", true));
    }
}
