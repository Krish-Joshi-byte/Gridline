package com.gridline.app;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

// Position heartbeat for units that are moving on their own — patrolling
// cruisers, medics changing posts, engines out on a familiarization lap.
// Without this the server's idea of where a unit is would freeze at the station
// it started the shift at, and every ETA would be measured from the wrong place.
@RestController
@RequestMapping("/api")
public class FleetController {

    private final ResponderStore responders;

    public FleetController(ResponderStore responders) {
        this.responders = responders;
    }

    @PostMapping("/responders/positions")
    public ResponseEntity<?> updatePositions(@RequestBody DispatchDtos.PositionBatch batch) {
        if (batch == null || batch.positions == null || batch.positions.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "positions are required"));
        }
        List<String> applied = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        for (DispatchDtos.PositionUpdate p : batch.positions) {
            if (p == null || p.unitId == null) continue;
            boolean ok = responders.updatePosition(p.unitId, p.lat, p.lng, p.status);
            if (ok) applied.add(p.unitId); else skipped.add(p.unitId);
        }
        return ResponseEntity.ok(Map.of("applied", applied, "skipped", skipped));
    }
}
