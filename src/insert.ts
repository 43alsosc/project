import { promises as fs } from "fs"; // Importer promises fra fs-modulen
import path from "path"; // Legg til path-modulen
import {
  createSubject,
  createEducationalSubject,
  createSubjectToEducationalSubject,
} from "@/src/queries/insert"; // Importer innsettingsfunksjonene

async function insertJsonData() {
  console.time("Timer");
  console.timeLog("Timer", "Starting script…");
  const chunkSize = 100; // Antall poster per innsetting

  // Definer filstier
  const subjectsFilePath = path.join(__dirname, "tmp/processed/subjects.json");
  const educationalSubjectsFilePath = path.join(
    __dirname,
    "tmp/processed/educational_subjects.json"
  );
  const subjectsToEducationalSubjectsPath = path.join(
    __dirname,
    "tmp/processed/subjectsToEducationalSubjects.json"
  );

  // Les JSON-filer asynkront
  const subjectsData = JSON.parse(await fs.readFile(subjectsFilePath, "utf8"));
  const educationalSubjectsData = JSON.parse(
    await fs.readFile(educationalSubjectsFilePath, "utf8")
  );
  const subjectsToEducationalSubjectsData = JSON.parse(
    await fs.readFile(subjectsToEducationalSubjectsPath, "utf8")
  );

  // // Sett inn fag
  // if (Array.isArray(subjectsData)) {
  //   for (let i = 0; i < subjectsData.length; i += chunkSize) {
  //     const chunk = subjectsData.slice(i, i + chunkSize);
  //     console.timeLog("Timer", "Fagkoder");
  //     for (const subject of chunk) {
  //       await createSubject(subject); // Bruker createSubject-funksjonen
  //     }
  //   }
  // }

  // // Sett inn opplæringsfag
  // if (Array.isArray(educationalSubjectsData)) {
  //   for (let i = 0; i < educationalSubjectsData.length; i += chunkSize) {
  //     const chunk = educationalSubjectsData.slice(i, i + chunkSize);
  //     console.timeLog("Timer", "Opplaeringsfag");
  //     for (const educationalSubject of chunk) {
  //       await createEducationalSubject(educationalSubject); // Bruker createEducationalSubject-funksjonen
  //     }
  //   }
  // }

  if (Array.isArray(subjectsToEducationalSubjectsData)) {
    for (
      let i = 0;
      i < subjectsToEducationalSubjectsData.length;
      i += chunkSize
    ) {
      const chunk = subjectsToEducationalSubjectsData.slice(i, i + chunkSize);
      console.timeLog("Timer", "Relasjoner");
      for (const SubjectToEduSub of chunk) {
        console.log(SubjectToEduSub);
        await createSubjectToEducationalSubject(SubjectToEduSub);
      }
    }
  }
}

insertJsonData();
