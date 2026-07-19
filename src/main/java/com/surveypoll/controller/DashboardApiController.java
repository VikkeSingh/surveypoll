package com.surveypoll.controller;

import com.surveypoll.model.SurveyRecord;
import com.surveypoll.service.SurveyService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Read-only endpoints that feed the dashboard: filtered listing + CSV report.
 */
@RestController
@RequestMapping("/api")
public class DashboardApiController {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SurveyService surveyService;

    public DashboardApiController(SurveyService surveyService) {
        this.surveyService = surveyService;
    }

    @GetMapping("/records")
    public List<SurveyRecord> records(
            @RequestParam(required = false) String projectId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String uid,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return surveyService.filter(projectId, status, uid, startDate, endDate);
    }

    @GetMapping("/records/report")
    public ResponseEntity<String> report(
            @RequestParam(required = false) String projectId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String uid,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {

        List<SurveyRecord> rows = surveyService.filter(projectId, status, uid, startDate, endDate);

        StringBuilder csv = new StringBuilder();
        csv.append("S.NO,Project ID,Username,Status,IP Address,Country,Create At\n");
        int i = 1;
        for (SurveyRecord r : rows) {
            csv.append(i++).append(',')
               .append(csv(r.getProjectId())).append(',')
               .append(csv(r.getUsername())).append(',')
               .append(csv(r.getStatus())).append(',')
               .append(csv(r.getIpAddress())).append(',')
               .append(csv(r.getCountry())).append(',')
               .append(csv(r.getCreateAt() == null ? "" : r.getCreateAt().format(TS)))
               .append('\n');
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=survey_report.csv")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv.toString());
    }

    private String csv(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
