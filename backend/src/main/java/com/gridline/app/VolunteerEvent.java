package com.gridline.app;

// A volunteer opportunity staff have published on the volunteer page. This is
// exactly what gets written to volunteer/events.json — sign-up counts are
// derived on the way out (see VolunteerEventView), never stored here.
public class VolunteerEvent {
    public String id;
    public String title;
    public String description;
    public String date;      // YYYY-MM-DD
    public String time;      // HH:mm, or empty
    public String location;
    public String category;
    public String faction;   // "Police" | "EMS" | "Fire" — which department is posting
    public String imageUrl;  // linked, not uploaded; empty when there's no picture
    public int capacity;
    public boolean featured; // shown in the "Urgently need volunteers" banner

    public VolunteerEvent() {}

    VolunteerEvent copy() {
        VolunteerEvent e = new VolunteerEvent();
        e.id = id;
        e.title = title;
        e.description = description;
        e.date = date;
        e.time = time;
        e.location = location;
        e.category = category;
        e.faction = faction;
        e.imageUrl = imageUrl;
        e.capacity = capacity;
        e.featured = featured;
        return e;
    }
}
