package com.gridline.app;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

// In-memory store for the demo. Swap for a real DB before this needs
// to survive a server restart.
@Component
public class CallNoteStore {
    private final Map<String, List<CallNote>> notesByCode = new ConcurrentHashMap<>();

    public void add(CallNote note) {
        notesByCode
            .computeIfAbsent(note.code, k -> new CopyOnWriteArrayList<>())
            .add(note);
    }

    public List<CallNote> get(String code) {
        return notesByCode.getOrDefault(code, List.of());
    }
}
