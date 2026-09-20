package com.gridline.app;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// In-memory store for the demo. Swap for a real DB before this needs
// to survive a server restart. Holds only what the citizen page itself
// collects — see CitizenReport for exactly what that is.
@Component
public class CitizenReportStore {
    private final ConcurrentHashMap<String, CitizenReport> reports = new ConcurrentHashMap<>();

    public CitizenReport add(CitizenReport report) {
        reports.put(report.id, report);
        return report;
    }

    public Optional<CitizenReport> updateLocation(String id, double lat, double lng, String locationName) {
        CitizenReport existing = reports.get(id);
        if (existing == null) return Optional.empty();
        existing.lat = lat;
        existing.lng = lng;
        existing.locationName = locationName;
        existing.updatedAt = Instant.now().toString();
        return Optional.of(existing);
    }

    // Newest first, so a dispatcher polling this sees fresh reports at the
    // top same as they'd expect on any incoming-call board.
    public List<CitizenReport> all() {
        List<CitizenReport> list = new ArrayList<>(reports.values());
        list.sort(Comparator.comparing((CitizenReport r) -> r.createdAt).reversed());
        return list;
    }
}
