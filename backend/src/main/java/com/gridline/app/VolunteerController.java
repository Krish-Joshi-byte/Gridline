package com.gridline.app;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

// The volunteer page's API: staff publish opportunities (tagged Police / EMS /
// Fire), residents sign up for them. All the rules live in VolunteerStore;
// this class only maps HTTP onto it.
//
// Errors always come back as { "error": "<message>" } — the same shape the
// other controllers use — so the frontend has one way to read them.
//
// NOTE: like every other endpoint in this project there is no server-side
// authentication. The operator password gate is client-side, so anyone who can
// reach the API directly can create, edit and delete posts — and read
// GET /registrations, which returns volunteers' names, emails and phone
// numbers. Put real auth in front of the write routes and /registrations
// before this holds real people's details.
@RestController
@RequestMapping("/api/volunteer")
public class VolunteerController {

    private final VolunteerStore store;

    public VolunteerController(VolunteerStore store) {
        this.store = store;
    }

    @GetMapping("/events")
    public List<VolunteerEventView> listEvents() {
        return store.listEvents();
    }

    @PostMapping("/events")
    public ResponseEntity<VolunteerEventView> createEvent(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(store.createEvent(body));
    }

    @PatchMapping("/events/{id}")
    public VolunteerEventView updateEvent(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return store.updateEvent(id, body);
    }

    @DeleteMapping("/events/{id}")
    public Map<String, String> deleteEvent(@PathVariable String id) {
        store.deleteEvent(id);
        return Map.of("deleted", id);
    }

    @PostMapping("/register")
    public ResponseEntity<VolunteerRegistration> register(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(store.register(body));
    }

    @GetMapping("/registrations")
    public List<VolunteerRegistration> registrations(@RequestParam(required = false) String eventId) {
        return store.registrations(eventId);
    }

    @ExceptionHandler(VolunteerStore.ApiError.class)
    public ResponseEntity<Map<String, String>> handleApiError(VolunteerStore.ApiError e) {
        return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadableBody(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "Request body must be valid JSON."));
    }
}
