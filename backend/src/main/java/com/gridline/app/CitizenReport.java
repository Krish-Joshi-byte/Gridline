package com.gridline.app;

import java.time.Instant;

// A location (and optional short description) a member of the public
// submitted through the citizen report page — never through the
// dispatcher console. Deliberately minimal: no name, no phone number,
// nothing beyond what's needed to put a pin on the dispatcher's map.
public class CitizenReport {
    public String id;
    public String code;          // synthetic intersection code so dispatch/notes work like any other call
    public String type;          // "police" | "fire" | "medical" | "unsure"
    public String message;
    public double lat;
    public double lng;
    public String locationName;  // human-readable label near the reported point
    public String createdAt;
    public String updatedAt;

    public CitizenReport(String id, String code, String type, String message,
                          double lat, double lng, String locationName) {
        this.id = id;
        this.code = code;
        this.type = type;
        this.message = message;
        this.lat = lat;
        this.lng = lng;
        this.locationName = locationName;
        this.createdAt = Instant.now().toString();
        this.updatedAt = this.createdAt;
    }
}
