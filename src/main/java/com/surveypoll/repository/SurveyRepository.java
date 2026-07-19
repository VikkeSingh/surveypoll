package com.surveypoll.repository;

import com.surveypoll.model.SurveyRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface SurveyRepository extends MongoRepository<SurveyRecord, String> {
}
