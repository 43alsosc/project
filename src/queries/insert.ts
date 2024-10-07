import { db } from "@/db";
import {
  educationalSubjects,
  InsertEducationalSubjects,
  InsertSubject,
  InsertSubjectsToEducationalSubjects,
  subjects,
  subjectsToEducationalSubjects,
} from "../schema";

export async function createSubject(data: InsertSubject) {
  await db.insert(subjects).values(data);
}

export async function createEducationalSubject(
  data: InsertEducationalSubjects
) {
  await db.insert(educationalSubjects).values(data);
}

export async function createSubjectToEducationalSubject(
  data: InsertSubjectsToEducationalSubjects
) {
  console.log(data);
  await db.insert(subjectsToEducationalSubjects).values(data);
}
