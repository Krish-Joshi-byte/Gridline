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

// Loads the real station list once at startup. Fails fast if the data file is
// missing or malformed — a dispatch map with no stations is not worth booting.
@Component
public class StationRegistry {

    private final List<Station> stations;
    private final String attribution;

    public StationRegistry(ObjectMapper mapper) throws IOException {
        try (InputStream in = new ClassPathResource("gridline/stations.json").getInputStream()) {
            StationFile file = mapper.readValue(in, StationFile.class);
            this.stations = file.stations == null ? List.of() : List.copyOf(file.stations);
            this.attribution = file.attribution;
        }
    }

    public List<Station> all() {
        return new ArrayList<>(stations);
    }

    public String attribution() {
        return attribution;
    }

    public Optional<Station> byId(String id) {
        if (id == null) return Optional.empty();
        return stations.stream().filter(s -> id.equals(s.id)).findFirst();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class StationFile {
        public String attribution;
        public List<Station> stations;
    }
}
