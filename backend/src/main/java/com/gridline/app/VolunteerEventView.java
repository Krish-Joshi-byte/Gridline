package com.gridline.app;

// What the API returns for an opportunity: the stored fields plus live
// sign-up counts, so the client never has to count registrations itself.
public record VolunteerEventView(
        String id,
        String title,
        String description,
        String date,
        String time,
        String location,
        String category,
        String faction,
        String imageUrl,
        int capacity,
        boolean featured,
        int registered,
        int remaining) {

    static VolunteerEventView of(VolunteerEvent e, int registered) {
        return new VolunteerEventView(
                e.id, e.title, e.description, e.date, e.time, e.location, e.category,
                e.faction, e.imageUrl, e.capacity, e.featured,
                registered, Math.max(0, e.capacity - registered));
    }
}
