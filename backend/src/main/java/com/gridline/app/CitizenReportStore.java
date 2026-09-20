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

    // Looked up by code (not id) because that's all the ElevenLabs webhook
    // has — the frontend passes the report's code as a dynamic variable
    // when it starts the voice call, and ElevenLabs echoes it straight
    // back on the post-call webhook.
    public Optional<CitizenReport> findByCode(String code) {
        if (code == null) return Optional.empty();
        String upper = code.toUpperCase();
        return reports.values().stream().filter(r -> upper.equals(r.code)).findFirst();
    }

    // Called once, after a citizen's voice call ends and ElevenLabs' post-call
    // webhook delivers its summary. This is the only place a report's type/
    // message get set from anything other than what the citizen typed —
    // deliberately so: a report only gets AI-authored content because an
    // actual call happened, never from the webhook guessing ahead of one.
    public Optional<CitizenReport> applyCallSummary(String code, String type, String message) {
        Optional<CitizenReport> existing = findByCode(code);
        if (existing.isEmpty()) return Optional.empty();
        CitizenReport report = existing.get();
        if (type != null && !type.isBlank()) report.type = type;
        if (message != null && !message.isBlank()) report.message = message;
        report.updatedAt = Instant.now().toString();
        return Optional.of(report);
    }

    // Newest first, so a dispatcher polling this sees fresh reports at the
    // top same as they'd expect on any incoming-call board.
    public List<CitizenReport> all() {
        List<CitizenReport> list = new ArrayList<>(reports.values());
        list.sort(Comparator.comparing((CitizenReport r) -> r.createdAt).reversed());
        return list;
    }
}
