package com.gridline.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

// Volunteer opportunities and the sign-ups against them.
//
// Unlike the rest of this backend (in-memory, resets on restart), volunteer
// data is written to two JSON files after every change and reloaded at
// startup — that is how the standalone volunteer app worked, and sign-ups are
// the one thing here nobody wants to lose to a restart. Where the files live
// is `volunteer.data-dir` (env VOLUNTEER_DATA_DIR), default ./data/volunteer.
// On a host with an ephemeral disk (Render's free tier) point it at a
// persistent volume, or the files go away on every deploy.
//
// Every read or write of the two lists happens while holding `lock`. That
// keeps "check capacity, then add a sign-up" atomic — two people racing for
// the last spot can't both get it — and stops saves from interleaving.
@Component
public class VolunteerStore {

    /** Which departments can be tagged as the source of a post. */
    public static final List<String> FACTIONS = List.of("Police", "EMS", "Fire");
    public static final String DEFAULT_FACTION = "Police";

    private static final int MAX_CAPACITY = 10_000;
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    /** Thrown for anything the client should see as a JSON error with a specific status. */
    public static final class ApiError extends RuntimeException {
        private static final long serialVersionUID = 1L;
        public final int status;

        public ApiError(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private final Object lock = new Object();
    private final List<VolunteerEvent> events = new ArrayList<>();
    private final List<VolunteerRegistration> registrations = new ArrayList<>();
    private final ObjectMapper mapper;
    private final Path eventsFile;
    private final Path registrationsFile;

    public VolunteerStore(ObjectMapper mapper,
                          @Value("${volunteer.data-dir:data/volunteer}") String dataDir) {
        this.mapper = mapper;
        Path dir = Paths.get(dataDir).toAbsolutePath().normalize();
        this.eventsFile = dir.resolve("events.json");
        this.registrationsFile = dir.resolve("registrations.json");

        // An unwritable data directory must not take the dispatch console down
        // with it: keep running, in memory, and say so.
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            System.err.println("Volunteer data directory " + dir + " isn't usable (" + e.getMessage()
                    + "). Volunteer posts and sign-ups will not survive a restart.");
        }

        boolean firstRun = !Files.exists(eventsFile);
        synchronized (lock) {
            load();
            if (firstRun && events.isEmpty()) {
                seed();
                saveEvents();
            }
        }
    }

    // ---- Opportunities -----------------------------------------------------

    public List<VolunteerEventView> listEvents() {
        synchronized (lock) {
            List<VolunteerEventView> out = new ArrayList<>(events.size());
            for (VolunteerEvent e : events) out.add(view(e));
            return out;
        }
    }

    public VolunteerEventView createEvent(Map<String, Object> body) {
        VolunteerEvent e = new VolunteerEvent();
        e.title = str(body, "title");
        e.description = str(body, "description");
        e.date = str(body, "date");
        e.time = str(body, "time");
        e.location = str(body, "location");
        e.category = str(body, "category");
        if (e.category.isEmpty()) e.category = "General";
        e.faction = str(body, "faction");
        if (e.faction.isEmpty()) e.faction = DEFAULT_FACTION;
        e.imageUrl = str(body, "imageUrl");
        e.capacity = intOf(body.get("capacity"), 0);
        e.featured = false;

        if (e.title.isEmpty() || e.date.isEmpty() || e.capacity <= 0) {
            throw new ApiError(400, "Title, date, and a capacity greater than 0 are required.");
        }
        validateEvent(e);

        synchronized (lock) {
            e.id = newId("evt");
            events.add(e);
            saveEvents();
            return view(e);
        }
    }

    /** Partial update. Used by the Feature toggle, but accepts any editable field. */
    public VolunteerEventView updateEvent(String id, Map<String, Object> body) {
        synchronized (lock) {
            VolunteerEvent current = findEvent(id);
            if (current == null) throw new ApiError(404, "No opportunity found with that id.");

            VolunteerEvent u = current.copy();
            if (body.containsKey("title")) u.title = str(body, "title");
            if (body.containsKey("description")) u.description = str(body, "description");
            if (body.containsKey("date")) u.date = str(body, "date");
            if (body.containsKey("time")) u.time = str(body, "time");
            if (body.containsKey("location")) u.location = str(body, "location");
            if (body.containsKey("category")) {
                u.category = str(body, "category");
                if (u.category.isEmpty()) u.category = "General";
            }
            if (body.containsKey("faction")) {
                u.faction = str(body, "faction");
                if (u.faction.isEmpty()) u.faction = DEFAULT_FACTION;
            }
            if (body.containsKey("imageUrl")) u.imageUrl = str(body, "imageUrl");
            if (body.containsKey("capacity")) {
                int cap = intOf(body.get("capacity"), 0);
                if (cap <= 0) throw new ApiError(400, "Capacity must be greater than 0.");
                u.capacity = cap;
            }
            if (body.containsKey("featured")) {
                Boolean f = boolOf(body.get("featured"));
                if (f == null) throw new ApiError(400, "\"featured\" must be true or false.");
                u.featured = f;
            }
            if (u.title.isEmpty() || u.date.isEmpty()) {
                throw new ApiError(400, "Title and date can't be empty.");
            }
            validateEvent(u);

            int registered = countRegistrationsFor(id);
            if (u.capacity < registered) {
                throw new ApiError(400, "Capacity can't be lower than the " + registered
                        + " people already signed up.");
            }

            events.set(events.indexOf(current), u);
            saveEvents();
            return view(u);
        }
    }

    /** Removes the opportunity and every sign-up against it. */
    public void deleteEvent(String id) {
        synchronized (lock) {
            VolunteerEvent e = findEvent(id);
            if (e == null) throw new ApiError(404, "No opportunity found with that id.");
            events.remove(e);
            registrations.removeIf(r -> r.eventId.equals(id));
            saveEvents();
            saveRegistrations();
        }
    }

    // ---- Sign-ups ----------------------------------------------------------

    public VolunteerRegistration register(Map<String, Object> body) {
        String eventId = str(body, "eventId");
        String name = str(body, "name");
        String email = str(body, "email");
        String phone = str(body, "phone");
        String notes = str(body, "notes");

        if (eventId.isEmpty() || name.isEmpty() || email.isEmpty()) {
            throw new ApiError(400, "Name, email, and an opportunity are required.");
        }
        if (name.length() > 120 || email.length() > 200 || phone.length() > 40 || notes.length() > 1000) {
            throw new ApiError(400, "One of those fields is too long.");
        }
        if (!EMAIL.matcher(email).matches()) {
            throw new ApiError(400, "Please enter a valid email address.");
        }

        synchronized (lock) {
            VolunteerEvent event = findEvent(eventId);
            if (event == null) throw new ApiError(404, "That opportunity is no longer available.");

            int registered = 0;
            for (VolunteerRegistration existing : registrations) {
                if (!existing.eventId.equals(eventId)) continue;
                registered++;
                if (existing.email.equalsIgnoreCase(email)) {
                    throw new ApiError(409, "That email address is already signed up for this opportunity.");
                }
            }
            if (registered >= event.capacity) throw new ApiError(409, "That opportunity is already full.");

            VolunteerRegistration r = new VolunteerRegistration();
            r.id = newId("reg");
            r.eventId = eventId;
            r.name = name;
            r.email = email;
            r.phone = phone;
            r.notes = notes;
            r.createdAt = Instant.now().toString();
            registrations.add(r);
            saveRegistrations();
            return r;
        }
    }

    /** All sign-ups, or just one opportunity's when eventId is given. */
    public List<VolunteerRegistration> registrations(String eventId) {
        synchronized (lock) {
            List<VolunteerRegistration> out = new ArrayList<>();
            for (VolunteerRegistration r : registrations) {
                if (eventId != null && !r.eventId.equals(eventId)) continue;
                out.add(r);
            }
            return out;
        }
    }

    // ---- Helpers (call while holding lock where they touch the lists) -------

    private VolunteerEventView view(VolunteerEvent e) {
        return VolunteerEventView.of(e, countRegistrationsFor(e.id));
    }

    private int countRegistrationsFor(String eventId) {
        int c = 0;
        for (VolunteerRegistration r : registrations) if (r.eventId.equals(eventId)) c++;
        return c;
    }

    private VolunteerEvent findEvent(String id) {
        for (VolunteerEvent e : events) if (e.id.equals(id)) return e;
        return null;
    }

    private static void validateEvent(VolunteerEvent e) {
        if (e.title.length() > 120) throw new ApiError(400, "Title is too long (120 characters max).");
        if (e.description.length() > 2000) throw new ApiError(400, "Description is too long (2000 characters max).");
        if (e.location.length() > 200) throw new ApiError(400, "Location is too long (200 characters max).");
        if (e.category.length() > 60) throw new ApiError(400, "Category is too long (60 characters max).");
        if (e.imageUrl.length() > 1000) throw new ApiError(400, "Image URL is too long (1000 characters max).");
        if (!FACTIONS.contains(e.faction)) {
            throw new ApiError(400, "Faction must be one of: " + String.join(", ", FACTIONS) + ".");
        }
        if (e.capacity > MAX_CAPACITY) throw new ApiError(400, "Capacity can't be more than " + MAX_CAPACITY + ".");
        try {
            LocalDate.parse(e.date);
        } catch (DateTimeParseException ex) {
            throw new ApiError(400, "Date must look like 2026-10-06.");
        }
        if (!e.time.isEmpty()) {
            try {
                LocalTime.parse(e.time);
            } catch (DateTimeParseException ex) {
                throw new ApiError(400, "Time must look like 17:30.");
            }
        }
    }

    private static String newId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }

    private static String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static int intOf(Object v, int def) {
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String) {
            try { return Integer.parseInt(((String) v).trim()); } catch (NumberFormatException e) { return def; }
        }
        return def;
    }

    private static Boolean boolOf(Object v) {
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof String) {
            String s = ((String) v).trim();
            if (s.equalsIgnoreCase("true")) return Boolean.TRUE;
            if (s.equalsIgnoreCase("false")) return Boolean.FALSE;
        }
        return null;
    }

    // ---- Persistence (call the save* methods while holding lock) ------------

    private void saveEvents() {
        writeAtomically(eventsFile, events);
    }

    private void saveRegistrations() {
        writeAtomically(registrationsFile, registrations);
    }

    /** Write to a temp file, then move it into place, so a crash can't leave a half-written data file. */
    private void writeAtomically(Path path, Object value) {
        try {
            Path tmp = path.resolveSibling(path.getFileName() + ".tmp");
            mapper.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), value);
            try {
                Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            System.err.println("Failed to write " + path + ": " + e.getMessage());
        }
    }

    private void load() {
        for (Map<String, Object> m : readObjectArray(eventsFile)) {
            VolunteerEvent e = new VolunteerEvent();
            e.id = str(m, "id");
            if (e.id.isEmpty()) e.id = newId("evt");
            e.title = str(m, "title");
            e.description = str(m, "description");
            e.date = str(m, "date");
            e.time = str(m, "time");
            e.location = str(m, "location");
            e.category = str(m, "category");
            if (e.category.isEmpty()) e.category = "General";
            e.faction = str(m, "faction");
            if (e.faction.isEmpty() || !FACTIONS.contains(e.faction)) e.faction = DEFAULT_FACTION;
            e.imageUrl = str(m, "imageUrl");
            e.capacity = intOf(m.get("capacity"), 0);
            Boolean f = boolOf(m.get("featured"));
            e.featured = f != null && f;
            events.add(e);
        }
        for (Map<String, Object> m : readObjectArray(registrationsFile)) {
            VolunteerRegistration r = new VolunteerRegistration();
            r.id = str(m, "id");
            if (r.id.isEmpty()) r.id = newId("reg");
            r.eventId = str(m, "eventId");
            r.name = str(m, "name");
            r.email = str(m, "email");
            r.phone = str(m, "phone");
            r.notes = str(m, "notes");
            r.createdAt = str(m, "createdAt");
            registrations.add(r);
        }
    }

    /**
     * Reads a JSON array of objects from a data file. A missing file is just an empty list.
     * A file that can't be parsed is copied aside (never overwritten silently) so no data is lost.
     */
    private List<Map<String, Object>> readObjectArray(Path file) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!Files.exists(file)) return out;
        try {
            List<Map<String, Object>> parsed =
                    mapper.readValue(file.toFile(), new TypeReference<List<Map<String, Object>>>() {});
            if (parsed != null) {
                for (Map<String, Object> item : parsed) if (item != null) out.add(item);
            }
        } catch (IOException e) {
            Path backup = file.resolveSibling(file.getFileName() + ".corrupt-" + System.currentTimeMillis());
            System.err.println("Couldn't read " + file.getFileName() + " (" + e.getMessage() + ").");
            try {
                Files.copy(file, backup);
                System.err.println("Saved a copy of the unreadable file as " + backup.getFileName() + " and started empty.");
            } catch (IOException ioe) {
                System.err.println("Also couldn't back it up: " + ioe.getMessage());
            }
            out.clear();
        }
        return out;
    }

    // Sample posts so the page isn't empty on the very first run. They only
    // appear when events.json doesn't exist yet — deleting them later does not
    // bring them back. Locations are generic placeholders, not real venues.
    private void seed() {
        Object[][] rows = {
                {"National Night Out Booth", "Staff the department's community booth: hand out safety literature, run the child ID kit table, and answer questions from neighbors.", "2026-10-06", "17:00", "Riverside Park Pavilion", "Community Outreach", "Police", 8, true, "https://placehold.co/640x360/1d3557/ffffff?text=Police"},
                {"Neighborhood Watch Kickoff", "Help set up chairs, sign in attendees, and hand out starter packets for a new Neighborhood Watch group's first meeting.", "2026-10-14", "18:30", "Precinct 3 Community Room", "Neighborhood Safety", "Police", 6, false, ""},
                {"Bike Rodeo Safety Course", "Assist officers running a youth bicycle safety course: helmet fitting, obstacle course setup, and course marshaling.", "2026-10-18", "10:00", "Lincoln Elementary Parking Lot", "Youth Programs", "Police", 12, false, "https://placehold.co/640x360/1d3557/ffffff?text=Police"},
                {"CPR & First Aid Community Class", "Help EMS instructors set up the training room, check in attendees, and hand out certification cards after a free community CPR class.", "2026-10-21", "18:00", "Fire Station 2 Training Room", "Health & Safety", "EMS", 10, true, "https://placehold.co/640x360/2a9d8f/ffffff?text=EMS"},
                {"Smoke Alarm Give-Away Day", "Join firefighters going door-to-door in a target neighborhood to install free smoke alarms and check exits for fire safety.", "2026-10-25", "09:00", "Meet at Fire Station 4", "Fire Prevention", "Fire", 6, true, "https://placehold.co/640x360/c1121f/ffffff?text=Fire"},
                {"Records Room Filing Support", "Help the records division scan and file archived paperwork. No law-enforcement background needed, just attention to detail.", "2026-11-02", "13:00", "Police Headquarters, Records Division", "Administrative Support", "Police", 3, false, ""}
        };
        for (Object[] s : rows) {
            VolunteerEvent e = new VolunteerEvent();
            e.id = newId("evt");
            e.title = (String) s[0];
            e.description = (String) s[1];
            e.date = (String) s[2];
            e.time = (String) s[3];
            e.location = (String) s[4];
            e.category = (String) s[5];
            e.faction = (String) s[6];
            e.capacity = (Integer) s[7];
            e.featured = (Boolean) s[8];
            e.imageUrl = (String) s[9];
            events.add(e);
        }
    }
}
