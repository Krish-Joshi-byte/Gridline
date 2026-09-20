package com.gridline.app;

// One community member signing up for one opportunity. Unlike the citizen
// report (which deliberately collects no identity), this holds a name, email
// and optional phone — treat volunteer/registrations.json as personal data.
public class VolunteerRegistration {
    public String id;
    public String eventId;
    public String name;
    public String email;
    public String phone;
    public String notes;
    public String createdAt;

    public VolunteerRegistration() {}
}
