package com.surveypoll.service;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
public class GeoIpService {

    private final RestClient restClient = RestClient.create();

    /**
     * Extract the real client IP, honouring reverse-proxy headers.
     */
    public String extractClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            // first entry is the original client
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }

    /**
     * Look up the country for a given IP using the free ip-api.com service.
     * Returns "Unknown" for private/loopback addresses or on any failure.
     */
    @SuppressWarnings("unchecked")
    public String lookupCountry(String ip) {
        if (ip == null || isPrivateOrLocal(ip)) {
            return "Unknown";
        }
        try {
            Map<String, Object> response = restClient.get()
                    .uri("http://ip-api.com/json/{ip}?fields=status,country", ip)
                    .retrieve()
                    .body(Map.class);

            if (response != null && "success".equals(response.get("status"))) {
                Object country = response.get("country");
                return country != null ? country.toString() : "Unknown";
            }
        } catch (Exception e) {
            // network/service failure — fall through
        }
        return "Unknown";
    }

    private boolean isPrivateOrLocal(String ip) {
        return ip.startsWith("127.")
                || ip.startsWith("10.")
                || ip.startsWith("192.168.")
                || ip.startsWith("172.16.")
                || ip.equals("0:0:0:0:0:0:0:1")
                || ip.equals("::1")
                || ip.equalsIgnoreCase("localhost");
    }
}
