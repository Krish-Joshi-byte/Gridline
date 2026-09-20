package com.gridline.app;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

// Two very different clients hit this controller:
//   - the public citizen report page (POST only — it can create a report
//     and update its own location, nothing else)
//   - the dispatcher console (GET /api/citizen-reports, polled, to pull new
//     reports onto the call board)
// Neither ever gets the other's data through here: the citizen page never
// calls GET, and GET never returns responder/unit positions or anything
// about other calls — just the reports themselves.
@RestController
@RequestMapping("/api/citizen-reports")
public class CitizenReportController {

    private static final Set<String> VALID_TYPES = Set.of("police", "fire", "medical", "unsure");
    private static final int MAX_MESSAGE_LENGTH = 500;

    private final CitizenReportStore store;
    private final IntersectionRegistry intersections;

    public CitizenReportController(CitizenReportStore store, IntersectionRegistry intersections) {
        this.store = store;
        this.intersections = intersections;
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateRequest req) {
        String error = validateLatLng(req.lat, req.lng);
        if (error != null) return ResponseEntity.badRequest().body(Map.of("error", error));

        String id = UUID.randomUUID().toString();
        String code = "CIT-" + id.replace("-", "").substring(0, 6).toUpperCase();
        String type = (req.type != null && VALID_TYPES.contains(req.type.toLowerCase())) ? req.type.toLowerCase() : "unsure";
        String message = sanitizeMessage(req.message);
        String locationName = "Near " + intersections.nearest(req.lat, req.lng).name;

        // Registers the exact reported point under this code so a later
        // POST /api/dispatch with this code routes units to the real spot,
        // not a hash-scattered fallback.
        intersections.register(code, locationName, req.lat, req.lng);

        CitizenReport report = store.add(new CitizenReport(id, code, type, message, req.lat, req.lng, locationName));
        return ResponseEntity.ok(report);
    }

    @PostMapping("/{id}/location")
    public ResponseEntity<?> updateLocation(@PathVariable String id, @RequestBody LocationRequest req) {
        String error = validateLatLng(req.lat, req.lng);
        if (error != null) return ResponseEntity.badRequest().body(Map.of("error", error));

        String locationName = "Near " + intersections.nearest(req.lat, req.lng).name;
        Optional<CitizenReport> updated = store.updateLocation(id, req.lat, req.lng, locationName);
        if (updated.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "unknown report"));

        // Re-register so dispatch on this report's code now routes to
        // where the citizen actually is, not where they started.
        intersections.register(updated.get().code, locationName, req.lat, req.lng);
        return ResponseEntity.ok(updated.get());
    }

    // Polled by the dispatcher console. Returns every report — there's no
    // per-report "seen" state on the server; the frontend tracks which IDs
    // it's already added to its own board.
    @GetMapping
    public List<CitizenReport> list() {
        return store.all();
    }

    private String validateLatLng(Double lat, Double lng) {
        if (lat == null || lng == null) return "lat and lng are required";
        if (lat < -90 || lat > 90) return "lat out of range";
        if (lng < -180 || lng > 180) return "lng out of range";
        return null;
    }

    private String sanitizeMessage(String message) {
        if (message == null) return null;
        String trimmed = message.trim();
        if (trimmed.isEmpty()) return null;
        return trimmed.length() > MAX_MESSAGE_LENGTH ? trimmed.substring(0, MAX_MESSAGE_LENGTH) : trimmed;
    }

    public static class CreateRequest {
        public Double lat;
        public Double lng;
        public String type;
        public String message;
    }

    public static class LocationRequest {
        public Double lat;
        public Double lng;
    }
}
