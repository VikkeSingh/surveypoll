package com.surveypoll.controller;

import com.surveypoll.model.SurveyRecord;
import com.surveypoll.service.SurveyService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The four public endpoints. They are called from anywhere (survey vendor
 * redirects, panels, etc.) and simply persist a record with the given status.
 *
 *   /survey/complete?uid=xxx&pid=xxx
 *   /survey/terminate?uid=xxx&pid=xxx
 *   /quotafull?uid=xxx&pid=xxx
 *   /security-terminate?uid=xxx&pid=xxx
 */
@RestController
public class SurveyController {

    private final SurveyService surveyService;

    public SurveyController(SurveyService surveyService) {
        this.surveyService = surveyService;
    }

    @GetMapping("/survey/complete")
    public Map<String, Object> complete(@RequestParam String uid,
                                        @RequestParam String pid,
                                        HttpServletRequest request) {
        return ok(surveyService.record(uid, pid, "completed", request));
    }

    @GetMapping("/survey/terminate")
    public Map<String, Object> terminate(@RequestParam String uid,
                                         @RequestParam String pid,
                                         HttpServletRequest request) {
        return ok(surveyService.record(uid, pid, "terminated", request));
    }

    @GetMapping("/quotafull")
    public Map<String, Object> quotafull(@RequestParam String uid,
                                         @RequestParam String pid,
                                         HttpServletRequest request) {
        return ok(surveyService.record(uid, pid, "quotafull", request));
    }

    @GetMapping("/security-terminate")
    public Map<String, Object> securityTerminate(@RequestParam String uid,
                                                 @RequestParam String pid,
                                                 HttpServletRequest request) {
        return ok(surveyService.record(uid, pid, "security-terminate", request));
    }

    private Map<String, Object> ok(SurveyRecord rec) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("saved", true);
        body.put("id", rec.getId());
        body.put("status", rec.getStatus());
        return body;
    }
}
