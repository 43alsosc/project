import { relations } from "drizzle-orm";
import {
  serial,
  text,
  timestamp,
  pgTable,
  jsonb,
  pgEnum,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";

// Enum definitions using PascalCase
export const StatusEnum = pgEnum("status", ["publisert", "utgaatt"]);
export const CurriculumStructureEnum = pgEnum("curriculum_structure", [
  "Vanlig",
  "Modulstrukturert",
]);
export const CurriculumTypeEnum = pgEnum("curriculum_type", [
  "laereplan_lk20",
  "laereplan",
]);

// Fagkoder tabell
export const subjects = pgTable("subjects", {
  id: text("id").notNull().unique(),
  code: text("code"),
  title: jsonb("title"),
  status: StatusEnum("status"),
  lastChanged: timestamp("last_changed"),
  labels: jsonb("labels"),
  subjectType: jsonb("subject_type"),
  educationLevel: jsonb("education_level"),
});

// Opplæringsfag tabell
export const educationalSubjects = pgTable("educational_subjects", {
  id: text("id").notNull().unique(),
  code: text("code"),
  title: jsonb("title"),
  status: StatusEnum("status"),
  lastChanged: timestamp("last_changed"),
  subjectType: jsonb("subject_type"),
  yearLevel: jsonb("year_level"),
  educationLevel: jsonb("education_level"),
});

// Lærelaner tabell
export const curricula = pgTable("curricula", {
  id: serial("id").notNull().unique(),
  code: text("code"),
  title: jsonb("title"),
  status: StatusEnum("status"),
  lastChanged: timestamp("last_changed"),
  curriculumStructure: CurriculumStructureEnum("curriculum_structure"),
  curriculumType: CurriculumTypeEnum("curriculum_type"),
  subjectType: jsonb("subject_type"),
});

// Kompetansemål tabell
export const competenceAims = pgTable("competence_aims", {
  id: serial("id").notNull().unique(),
  code: text("code"),
  title: jsonb("title"),
  status: StatusEnum("status"),
  lastChanged: timestamp("last_changed"),
});

// Kompetansemålsett tabell
export const setOfCompetenceAims = pgTable("set_of_competence_aims", {
  id: serial("id").notNull().unique(),
  code: text("code"),
  title: jsonb("title"),
  status: StatusEnum("status"),
  lastChanged: timestamp("last_changed"),
});

/* -------------------------------------------------- Relasjons Tabeller ------------------------------------------------------------- */
export const subjectRelations = relations(subjects, ({ many }) => ({
  subjectsToEducationalSubjects: many(subjectsToEducationalSubjects),
}));

export const educationalSubjectsRelations = relations(
  educationalSubjects,
  ({ many }) => ({
    subjectsToEducationalSubjects: many(subjectsToEducationalSubjects),
  })
);

export const subjectsToEducationalSubjects = pgTable(
  "subjects_to_educational_subjects",
  {
    subjectsId: text("subjects_id").references(() => subjects.id),
    educationalSubjectsId: text("educational_subjects_id").references(
      () => educationalSubjects.id
    ),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.subjectsId, t.educationalSubjectsId] }),
  })
);

export const subjectsToEducationalSubjectsRelations = relations(
  subjectsToEducationalSubjects,
  ({ one }) => ({
    subject: one(subjects, {
      fields: [subjectsToEducationalSubjects.subjectsId],
      references: [subjects.id],
    }),
    educationalSubject: one(educationalSubjects, {
      fields: [subjectsToEducationalSubjects.educationalSubjectsId],
      references: [educationalSubjects.id],
    }),
  })
);

/* ------------------------------------------------------ inferTypes ----------------------------------------------------------------- */

export type InsertSubject = typeof subjects.$inferInsert;
export type SelectSubject = typeof subjects.$inferSelect;

export type InsertEducationalSubjects = typeof educationalSubjects.$inferInsert;
export type SelectEducationalSubjects = typeof educationalSubjects.$inferSelect;

export type InsertSubjectsToEducationalSubjects =
  typeof subjectsToEducationalSubjects.$inferInsert;
export type SelectSubjectsToEducationalSubjects =
  typeof subjectsToEducationalSubjects.$inferSelect;
