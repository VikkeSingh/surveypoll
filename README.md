# Surveypoll

A minimal Spring Boot service that records survey outcomes and shows them on a
single dashboard page. Data is stored in MongoDB. Each incoming call also
captures the caller's **IP address** and resolves the **country** (via the free
`ip-api.com` service).

## The four endpoints

All four take `uid` (username) and `pid` (project id) as query params and store
one record with the matching status:

| Endpoint | Stored status |
|---|---|
| `GET /survey/complete?uid=xxx&pid=xxx` | `completed` |
| `GET /survey/terminate?uid=xxx&pid=xxx` | `terminated` |
| `GET /quotafull?uid=xxx&pid=xxx` | `quotafull` |
| `GET /security-terminate?uid=xxx&pid=xxx` | `security-terminate` |

## Dashboard

Open **http://localhost:8080/** — the single HTML page. It reads only from the
data written by the four endpoints and supports filtering by Project ID, Status,
Start/End date, and UID, plus a CSV **REPORT** export.

Dashboard data APIs (used by the page):
- `GET /api/records` — filtered JSON list
- `GET /api/records/report` — filtered CSV download

## Requirements

- Java 17+
- MongoDB running on `mongodb://localhost:27017` (database `surveypoll`)

Maven is **not** required — a Maven wrapper (`./mvnw`) is bundled.

### Start MongoDB

Easiest with Docker:

```bash
docker run -d --name surveypoll-mongo -p 27017:27017 mongo:7
```

Or install natively: `brew install mongodb-community && brew services start mongodb-community`.

## Run

```bash
cd surveypoll
./mvnw spring-boot:run
```

Then visit http://localhost:8080/.

## Try it

```bash
curl "http://localhost:8080/survey/complete?uid=vmgxhcyutydr3&pid=ZEPR47378_B2C"
curl "http://localhost:8080/survey/terminate?uid=user2&pid=ZEPR47378_B2C"
curl "http://localhost:8080/quotafull?uid=user3&pid=ZEPR47378_B2C"
curl "http://localhost:8080/security-terminate?uid=user4&pid=ZEPR47378_B2C"
```

Refresh the dashboard to see the rows.

> Note: for `localhost`/private IPs the country resolves to `Unknown`. Real
> public IPs (or a request forwarded with an `X-Forwarded-For` header) resolve
> to an actual country.

## Configuration

Edit `src/main/resources/application.properties`:

```properties
server.port=8080
spring.data.mongodb.uri=mongodb://localhost:27017/surveypoll
```
