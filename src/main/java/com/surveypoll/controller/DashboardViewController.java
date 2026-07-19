package com.surveypoll.controller;

import com.surveypoll.model.SurveyRecord;
import com.surveypoll.service.SurveyService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * Server-side rendered dashboard. Reuses {@link SurveyService#filter} (the same
 * logic behind the REST API) and hands the rows to a Thymeleaf template.
 */
@Controller
public class DashboardViewController {

    private final SurveyService surveyService;

    public DashboardViewController(SurveyService surveyService) {
        this.surveyService = surveyService;
    }

    @GetMapping("/login")
    public String login() {
        return "login";
    }

    @GetMapping("/")
    public String dashboard(
            @RequestParam(required = false) String projectId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String uid,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            Model model) {

        List<SurveyRecord> records = surveyService.filter(projectId, status, uid, startDate, endDate);

        model.addAttribute("records", records);
        model.addAttribute("projectId", projectId);
        model.addAttribute("status", status);
        model.addAttribute("uid", uid);
        model.addAttribute("startDate", startDate);
        model.addAttribute("endDate", endDate);

        return "dashboard";
    }
}