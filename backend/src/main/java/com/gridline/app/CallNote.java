package com.gridline.app;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;

public class CallNote {
    public String conversationId;
    public String code;
    public String summary;
    public String severity;
    public String receivedAt;
    public JsonNode transcript;

    public CallNote(String conversationId, String code, String summary, String severity, JsonNode transcript) {
        this.conversationId = conversationId;
        this.code = code;
        this.summary = summary;
        this.severity = severity;
        this.receivedAt = Instant.now().toString();
        this.transcript = transcript;
    }
}
