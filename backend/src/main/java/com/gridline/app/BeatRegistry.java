package com.gridline.app;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

// Loads beats/posts/fire districts once at startup.
@Component
public class BeatRegistry {

    private final List<Beat> beats;
    private final String note;

    public BeatRegistry(ObjectMapper mapper) throws IOException {
        try (InputStream in = new ClassPathResource("gridline/beats.json").getInputStream()) {
            BeatFile file = mapper.readValue(in, BeatFile.class);
            this.beats = file.beats == null ? List.of() : List.copyOf(file.beats);
            this.note = file.note;
        }
    }

    public List<Beat> all() {
        return new ArrayList<>(beats);
    }

    public String note() {
        return note;
    }

    public Optional<Beat> byId(String id) {
        if (id == null) return Optional.empty();
        return beats.stream().filter(b -> id.equals(b.id)).findFirst();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class BeatFile {
        public String note;
        public List<Beat> beats;
    }
}
