package com.gridline.app;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// Single place that controls which origins may call this API. Set
// app.cors.allowed-origins (comma-separated) in application.properties
// or via the APP_CORS_ALLOWED_ORIGINS env var — defaults cover the
// production frontend at gridline.wiki plus local dev.
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origins:https://gridline.wiki,https://www.gridline.wiki,http://localhost:5173}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins(allowedOrigins.split("\\s*,\\s*"))
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*");

        registry.addMapping("/notes/**")
            .allowedOrigins(allowedOrigins.split("\\s*,\\s*"))
            .allowedMethods("GET")
            .allowedHeaders("*");
    }
}
