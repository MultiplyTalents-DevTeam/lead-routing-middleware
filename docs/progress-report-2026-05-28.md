# 7-Minute Automation Progress Report

**Client:** Multiply Talents  
**Date:** May 28, 2026  
**Project:** 7-Minute Automation  
**Stack:** Retell AI, GoHighLevel, Custom Middleware API, Supabase, Vercel

## Status

The inbound Voice AI path is ready for deployment and live testing.

The middleware changes are implemented locally and the test suite passes. The next step is to deploy the updated code to Vercel and run one controlled Retell test call through the full flow.

What is ready now:

- Retell inbound webhook handling
- Client and service routing
- GHL contact creation/update
- GHL opportunity creation
- Direct GHL appointment booking when Retell gives an exact date and time
- Safe booking skip when date/time is vague
- GHL tagging for source, client, service, and appointment status
- Supabase storage for clients, leads, and events
- Dashboard event visibility

What still needs live validation:

- Supabase read/write behavior after deployment
- Retell to middleware to GHL appointment booking
- GHL workflow triggers from middleware tags
- Dashboard logs after refresh
- Supabase events and leads records after a real call

## Current status at a glance

| Area | Status | Notes |
| --- | --- | --- |
| Middleware API | Working locally | Tests and builds pass |
| Retell inbound voice path | Ready for live test | Webhook flow is implemented |
| GHL contact/opportunity creation | Ready for live test | Requires deployed code and live GHL credentials |
| Direct appointment booking | Ready for live test | Books only with exact date/time |
| Supabase storage | Implemented | Needs deploy validation |
| Admin dashboard logs | Implemented | Needs deploy validation |
| GHL workflows 01-04 | Working / active enrollment | Based on current GHL enrollment counts |
| GHL workflows 00 and 05-09 | In testing | Published, but not fully validated |
| Chat bot, outbound voice, native lead sources, external vendors | Phase 2 | Not part of the current production MVP |

## Completed work

### Middleware API

The middleware now handles the full inbound Retell path.

Retell sends a `call_analyzed` webhook. The middleware reads the call data, resolves the client, routes by service and ZIP, creates or updates the GHL contact, creates the GHL opportunity, and logs the event.

The Retell webhook currently reads:

- first name
- last name
- phone
- email
- service requested
- ZIP code
- requested date
- requested time
- appointment intent
- callback request
- call summary

### Multi-client routing

The middleware now supports multiple seeded clients:

- Multiply Talents
- Austin HVAC Demo
- ABC Plumbing Demo
- Demo Electrical

Each client has its own services and routing rules. Retell should send `client_slug` so the middleware knows which client config to use.

Example:

```json
{
  "client_slug": "abc_plumbing_demo",
  "service_requested": "Drain Cleaning",
  "zip_code": "90001"
}
```

### Calendar routing

The routing engine supports:

- ZIP list routes
- geofence routes
- polygon routes
- no-area restriction routes

For the current demo setup, all demo routes use this real GHL calendar ID:

```text
LzcCsHBbXZtBS1mAwbEc
```

### Direct appointment booking

The middleware can now create a GHL calendar appointment.

It books only when Retell gives a clear appointment request:

```json
{
  "appointment_intent": true,
  "requested_date": "2026-05-29",
  "requested_time": "09:00"
}
```

If the caller says something vague like "tomorrow morning" or "sometime next week," the middleware does not guess. It still creates the contact and opportunity, but it skips the calendar booking and records the reason.

This prevents bad automatic bookings.

### GHL tags

The middleware adds tags so GHL workflows and the team can see where each lead came from.

Examples:

```text
middleware:processed
middleware:source:retell-ai
middleware:client:abc-plumbing-demo
middleware:service:drain-cleaning
middleware:appointment-booked
middleware:appointment-confirmed
middleware:estimate-requested
```

These tags are the main bridge between the middleware and GHL workflow branching.

### Bot mode controls

The Bot Setup buttons now affect backend behavior.

| Button | On | Off |
| --- | --- | --- |
| Appt Requested | Allows direct appointment booking | Creates contact/opportunity but skips booking |
| Appt Confirmed | Adds confirmation tag/workflow flag after booking | Does not add confirmation tag/flag |
| Estimate Requested | Allows estimate-requested tag/workflow flag | Suppresses estimate-requested tag/flag |

### Supabase storage

Supabase support has been added for:

- clients
- leads
- events

Vercel environment variables are already planned/configured:

```text
STORE_DRIVER=supabase
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

After deployment, the middleware should stop relying on Vercel `/tmp` JSON storage. Clients, leads, and events should persist across page refreshes and redeploys.

### Dashboard updates

The dashboard has been updated so it is easier to use during a live test.

Updates include:

- readable client dropdown
- persistent demo clients after Supabase deploy
- Recent Events panel showing client, service, and appointment status
- support for showing booked or skipped appointment results

## GHL workflow status

The workflows are published, but not all are equally validated.

### Working / active enrollment

| Workflow | Status | Total enrolled | Active enrolled | Notes |
| --- | --- | ---: | ---: | --- |
| Workflow 01 - Inbound Call Voice AI | Working | 3 | 1 | Main inbound Voice AI workflow |
| Workflow 02 - Contacting New Lead Funnel | Working | 3 | 1 | Follow-up path has active enrollment |
| Workflow 03 - Engaged Follow-Up Funnel | Working / enrollment path validated | 3 | 0 | Enrollment path has been tested |
| Workflow 04 - Annual Nurture Funnel | Working / enrollment path validated | 4 | 0 | Enrollment path has been tested |

### In testing

| Workflow | Status | Notes |
| --- | --- | --- |
| Workflow 00 - Won Stage to Fulfillment | In testing | Needs trigger and stage movement validation |
| Workflow 05 - Callback Request Funnel | In testing | Needs callback trigger validation |
| Workflow 06 - Booked Welcome Funnel | In testing | Needs controlled test from middleware booking tag |
| Workflow 07 - No-Show Recovery Funnel | In testing | Needs no-show path validation |
| Workflow 08 - Cancellation Recovery Funnel | In testing | Needs cancellation path validation |
| Workflow 09 - Estimate Follow-Up Funnel | In testing | Needs estimate-requested / estimate sent validation |

## Local verification completed

The current code passes local verification.

```text
npm.cmd run test -w @mt/api
7 tests passed

npm.cmd run build
API build passed
Web build passed
```

Tests cover:

- webhook idempotency
- estimate stage mapping
- Retell exact date/time booking
- Retell vague date/time skip
- Appt Requested toggle disabling booking

## Live test plan

Run this after the updated code is deployed to Vercel.

### Test scenario

Client:

```text
ABC Plumbing Demo
```

Retell metadata:

```json
{
  "client_slug": "abc_plumbing_demo"
}
```

Caller request:

```text
Drain Cleaning
ZIP 90001
May 29, 2026 at 9:00 AM
```

Expected Retell extraction:

```json
{
  "service_requested": "Drain Cleaning",
  "zip_code": "90001",
  "appointment_intent": true,
  "requested_date": "2026-05-29",
  "requested_time": "09:00"
}
```

### What to verify

- GHL contact is created or updated
- GHL opportunity is created
- GHL appointment is created on the real calendar
- GHL tags are added
- Middleware Recent Events shows the processed call
- Supabase `events` table has a new record
- Supabase `leads` table has a new record
- Browser refresh does not remove logs or demo clients

## Phase 2

The video shows a bigger lead intake system:

- Inbound Voice Bot
- Chat Booking Bot
- Outbound Voice Bot
- Native Lead Sources
- External Vendors

The current production MVP focuses on the inbound Retell voice path. That is the right first release.

Phase 2 should add the other intake channels one at a time:

1. Extend `/api/webhooks/lead` into a universal lead intake endpoint.
2. Add native GHL lead sources such as forms, missed calls, Google Ads, and Facebook leads.
3. Add external vendor webhooks such as Angi, Thumbtack, and other lead vendors.
4. Add Chat Booking Bot intake.
5. Add outbound Retell calls for unbooked leads.

## Production notes

Before final production sign-off:

- deploy the updated middleware to Vercel
- rotate the Supabase service role key
- add Retell webhook signature verification
- confirm GHL workflow triggers against middleware tags
- run controlled tests for workflows 00 and 05-09
- confirm Supabase logs persist after refresh and redeploy

