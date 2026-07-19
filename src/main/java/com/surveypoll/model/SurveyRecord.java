package com.surveypoll.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document(collection = "survey_records")
public class SurveyRecord {

    @Id
    private String id;

    private String projectId;   // pid
    private String username;     // uid
    private String status;       // completed / terminated / quotafull / security-terminate
    private String ipAddress;
    private String country;
    private LocalDateTime createAt;

    public SurveyRecord() {
    }

    public SurveyRecord(String projectId, String username, String status,
                        String ipAddress, String country, LocalDateTime createAt) {
        this.projectId = projectId;
        this.username = username;
        this.status = status;
        this.ipAddress = ipAddress;
        this.country = country;
        this.createAt = createAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public LocalDateTime getCreateAt() {
        return createAt;
    }

    public void setCreateAt(LocalDateTime createAt) {
        this.createAt = createAt;
    }
}
