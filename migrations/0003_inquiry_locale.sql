-- Phase 6.2 — preserve the language used when a visitor submits a project inquiry.
ALTER TABLE project_inquiries ADD COLUMN submission_language TEXT CHECK (submission_language IN ('ar','en'));
