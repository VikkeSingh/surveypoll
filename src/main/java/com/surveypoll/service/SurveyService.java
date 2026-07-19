package com.surveypoll.service;

import com.surveypoll.model.SurveyRecord;
import com.surveypoll.repository.SurveyRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class SurveyService {

    private final SurveyRepository repository;
    private final GeoIpService geoIpService;

    public SurveyService(SurveyRepository repository, GeoIpService geoIpService) {
        this.repository = repository;
        this.geoIpService = geoIpService;
    }

    /**
     * Store a survey event. Captures IP + country from the incoming request.
     */
    public SurveyRecord record(String uid, String pid, String status, HttpServletRequest request) {
        String ip = geoIpService.extractClientIp(request);
        String country = geoIpService.lookupCountry(ip);

        SurveyRecord rec = new SurveyRecord(pid, uid, status, ip, country, LocalDateTime.now());
        return repository.save(rec);
    }

    public List<SurveyRecord> findAll() {
        return repository.findAll(Sort.by(Sort.Direction.DESC, "createAt"));
    }

    /**
     * Filtered listing used by both the REST API and the Thymeleaf dashboard.
     */
    public List<SurveyRecord> filter(String projectId, String status, String uid,
                                     String startDate, String endDate) {
        LocalDate start = parseDate(startDate);
        LocalDate end = parseDate(endDate);

        return findAll().stream()
                .filter(r -> blank(projectId) || eqIgnoreCase(r.getProjectId(), projectId))
                .filter(r -> blank(status) || eqIgnoreCase(r.getStatus(), status))
                .filter(r -> blank(uid) || eqIgnoreCase(r.getUsername(), uid))
                .filter(r -> start == null || (r.getCreateAt() != null
                        && !r.getCreateAt().toLocalDate().isBefore(start)))
                .filter(r -> end == null || (r.getCreateAt() != null
                        && !r.getCreateAt().toLocalDate().isAfter(end)))
                .toList();
    }

    private LocalDate parseDate(String value) {
        if (blank(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private boolean eqIgnoreCase(String a, String b) {
        return a != null && a.equalsIgnoreCase(b);
    }
}
