import { join, dirname } from "path";
import { fileURLToPath } from "node:url";
import { access, constants, existsSync, mkdirSync, promises } from "node:fs";
import axios from "axios";
import { unzip } from "fflate";
import pMap from "p-map";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOWNLOAD_PATH = join(__dirname, "./tmp");
const DATA_ZIP_PATH = `${DOWNLOAD_PATH}/kl06.zip`;
const FILES_PATH = `${DOWNLOAD_PATH}/extracted`;
const PROCESSED_PATH = `${DOWNLOAD_PATH}/processed`;
const DATA_ZIP_URL = "https://data.udir.no/kl06/v201906/dump/json";

type Language =
  | "default"
  | "eng"
  | "nno"
  | "nob"
  | "sme"
  | "deu"
  | "sma"
  | "smj"
  | "fra"
  | "ita"
  | "spa";

type Title = Record<Language, string>;

type Label =
  | "tverrfaglig_eksamen"
  | "for_montessori"
  | "for_privatskoler"
  | "for_steiner"
  | "forsoek"
  | "avviksfag"
  | "dove_tunghorte"
  | "for_den_tyske_skolen"
  | "for_voksenopplaering"
  | "grunnleggende_norsk"
  | "kort_botid"
  | "kunnskapsloftet_samisk"
  | "laerefag_med_fordypningsomraader"
  | "laerling"
  | "lokalt_omfang"
  | "merkelapp_finsk"
  | "morsmaal"
  | "paabygg"
  | "saerlop"
  | "valgfag"
  | "verneverdig_tradisjonshaandverk";

type Labels = Record<Label, boolean>;

type Status =
  | "publisert"
  | "utgaatt"
  | "til_revidering"
  | "ugyldig"
  | "under_arbeid";

type SubjectType =
  | "fagtype_felles_programfag"
  | "fagtype_fellesfag"
  | "fagtype_grunnskolefag"
  | "fagtype_individuellopplæringsplan"
  | "fagtype_prosjekt_til_fordypning"
  | "fagtype_uspesifisert_programfag"
  | "fagtype_valgfag"
  | "fagtype_valgfritt_programfag"
  | "fagtype_yrkesfaglig_fordypning";

type EducationLevel = "Grunnskole" | "Videregående opplæring";

type Year =
  | "aarstrinn1"
  | "aarstrinn2"
  | "aarstrinn3"
  | "aarstrinn4"
  | "aarstrinn5"
  | "aarstrinn6"
  | "aarstrinn7"
  | "aarstrinn8"
  | "aarstrinn9"
  | "aarstrinn10"
  | "vg1"
  | "vg2"
  | "vg3"
  | "aarstrinn_vg4"
  | "aarstrinn_fov"
  | "vg2_vg3_saerloep"
  | "paabygning_generell_studiekompetanse"
  | "opplaering_bedrift";

type YearLevel = Record<"Year Level", Year>;

type CurriculumStructure = "Vanlig" | "Modulstrukturert";

type CompetenceGoal = Record<string, string>;

type CurriculumReference = Record<string, Title> | Record<string, string>;

type EducationalSubjectReference =
  | Record<string, Title>
  | Record<string, string>;

type SubjectCodeReference = Record<string, Title> | Record<string, string>;

type CrossCurricularThemes = Record<string, Title> | Record<string, string>;

type CoreSubjects = Record<string, Title> | Record<string, string>;

type CompetenceGoalSetReference = Record<string, string>;

type ProcessedSubject = {
  id: string | null;
  code: string;
  title: Title;
  status: Status;
  last_changed: string | null;
  labels: Labels;
  // educational_subject: Record<string, string> | null;
  subject_type: string;
  education_level: string;
};

type ProcessedEducationalSubject = {
  id: string | null;
  // subject_code_id: string | string[];
  // curriculum_id: string | string[];
  code: string;
  title: Title;
  status: Status;
  last_changed: string | null;
  subject_type: string | string[];
  education_level: string | string[];
  year_level: YearLevel | YearLevel[];
};

type ProcessedSubjectsToEducationalSubjects = {
  subjects_id: string;
  educational_subjects_id: string;
};

type ProcessedCurriculum = {
  // id: number | null;
  code: string;
  title: Title;
  status: Status;
  last_changed: string | null;
  curriculum_structure: CurriculumStructure;
  subject_type: SubjectType | SubjectType[];
  curriculum_type: string;
  // competence_goal_set_reference: string | string[] | null;
  // subject_code_reference: SubjectCodeReference | SubjectCodeReference[] | null;
};

type ProcessedCompetenceGoalSet = {
  // id: number | null;
  code: string;
  title: Title;
  status: Status;
  last_changed: string | null;
  // competence_goal_reference: CompetenceGoal[];
  // educational_subject_reference: EducationalSubjectReference[];
  // subject_code_reference: string | string[];
  // curriculum_reference: CurriculumReference[];
};

type ProcessedCompetenceGoal = {
  // id: number | null;
  code: string;
  title: Title;
  status: Status;
  last_changed: string | null;
  // connected_cross_curricular_themes:
  //   | CrossCurricularThemes
  //   | CrossCurricularThemes[]
  //   | null;
  // connected_core_subjects: CoreSubjects | CoreSubjects[] | null;
  // competence_goal_set_reference: string | CompetenceGoalSetReference[] | null;
  // educational_subject_reference: string | EducationalSubjectReference[] | null;
  // curriculum_reference: string | CurriculumReference[] | null;
  // subject_code_reference: string | SubjectCodeReference[] | null;
};

type KmpsettSubType = {
  "etter-fag": { kode: string; status: string };
};

type EduSubType = {
  kode: string;
  status: string;
  tittel: string[];
  "erstattes-av": { kode: string; status: string };
  "fagkode-referanser": { kode: string; status: string };
};

// Legg til disse globale variablene øverst i filen, utenfor alle funksjoner
let subjectCodeData: ProcessedSubject[] = [];
let educationalSubjectData: ProcessedEducationalSubject[] = [];
let subjectsToEducationalSubjects: ProcessedSubjectsToEducationalSubjects[] =
  [];
let curriculumData: ProcessedCurriculum[] = [];
let competenceGoalSetsData: ProcessedCompetenceGoalSet[] = [];
let competenceGoalData: ProcessedCompetenceGoal[] = [];

let COMBINED_COMPETENCE_GOAL_PATH = ``;
let COMBINED_CURRICULUM_PATH = ``;
let COMBINED_COMPETENCE_GOAL_SETS_PATH = ``;

async function start() {
  console.time("Timer");
  console.timeLog("Timer", "Starting script…");

  try {
    await downloadData();
    console.timeLog("Timer", "Data downloaded");
    await extractData();
    console.timeLog("Timer", "Data extracted");
    await processSubjectCodes();
    console.timeLog("Timer", "Subject codes processed");
    await processEducationalSubjects();
    console.timeLog("Timer", "Educational subjects processed");
    await processCurricula();
    console.timeLog("Timer", "Curricula processed");
    await processCompetenceGoalSets();
    console.timeLog("Timer", "Competence goal sets processed");
    await processCompetenceGoals();
    console.timeLog("Timer", "Competence goals processed");
    await useProcessedData();
    console.timeLog("Timer", "Processed data used");
  } catch (error) {
    console.timeLog("Timer", "An error occurred");
    console.error(error);
  }

  console.timeLog("Timer", "Script complete");
  console.timeEnd("Timer");
}

async function downloadData() {
  console.timeLog("Timer", "Downloading data");

  // Check if the download folder exists
  const downloadFolderExists = await new Promise<boolean>((resolve) => {
    access(DOWNLOAD_PATH, constants.F_OK, (err) => {
      resolve(!err);
    });
  });

  // Create the download folder if it doesn't exist
  if (!downloadFolderExists) {
    console.timeLog("Timer", "Creating download folder");
    await promises.mkdir(DOWNLOAD_PATH, { recursive: true });
  }

  // Check if zip file exists
  if (downloadFolderExists) {
    const zipFileExists = await new Promise<boolean>((resolve) => {
      access(DATA_ZIP_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    });

    // Exit early if the zip file already exists
    if (zipFileExists) {
      console.timeLog("Timer", "Zip file already exists, skipping download");
      return;
    }
  }

  console.timeLog("Timer", "Downloading zip file");

  const response = await axios({
    method: "get",
    url: DATA_ZIP_URL,
    responseType: "arraybuffer",
  })
    .then((response: any) => response.data)
    .catch((error: any) => {
      console.timeLog("Timer", "Error downloading zip file");
      throw error;
    });

  console.timeLog("Timer", "Download complete");

  // Save the zip file
  console.timeLog("Timer", "Saving zip file");
  await promises.writeFile(DATA_ZIP_PATH, new Uint8Array(response)); // Endret fra Buffer til Uint8Array
  console.timeLog("Timer", "Zip file saved");
}

async function extractData() {
  console.timeLog("Timer", "Extracting data");

  // Check if the extracted folder exists
  const extractedFolderExists = await new Promise<boolean>((resolve) => {
    access(FILES_PATH, constants.F_OK, (err) => {
      resolve(!err);
    });
  });

  // Exit early if the extracted folder already exists
  if (extractedFolderExists) {
    console.timeLog(
      "Timer",
      "Extracted folder already exists, skipping extraction"
    );
    return;
  }

  // Check if the zip file exists
  const zipFileExists = await new Promise<boolean>((resolve) => {
    access(DATA_ZIP_PATH, constants.F_OK, (err) => {
      resolve(!err);
    });
  });

  // Throw an error if the zip file doesn't exist
  if (!zipFileExists) {
    console.timeLog("Timer", "Zip file doesn't exist");
    throw new Error("Zip file doesn't exist");
  }

  // Decompress the zip file
  console.timeLog("Timer", "Decompressing zip file");
  const zipFile = await promises.readFile(DATA_ZIP_PATH);

  if (!zipFile) {
    console.timeLog("Timer", "Failed to read zip file");
    throw new Error("Failed to read zip file");
  }

  console.log("Zip file size:", zipFile.length);

  const unzipAsync = (
    inputBuffer: Uint8Array
  ): Promise<Record<string, Uint8Array>> => {
    return new Promise((resolve, reject) => {
      unzip(inputBuffer, (err: any, decoded: any) => {
        if (err) {
          console.timeLog("Timer", "Error during unzip");
          reject(err);
        } else {
          resolve(decoded as Record<string, Uint8Array>);
        }
      });
    });
  };

  let unzipped;
  try {
    unzipped = await unzipAsync(new Uint8Array(zipFile)); // Konverterer Buffer til Uint8Array
  } catch (error) {
    console.timeLog("Timer", "Failed to unzip file");
    console.error(error);
    throw error;
  }

  console.log("Unzipped files:", Object.keys(unzipped));

  // Iterate through unzipped entries and write them to disk
  for (const filename in unzipped) {
    const fileData = unzipped[filename];
    const filePath = `${FILES_PATH}/${filename}`;

    // Make sure the directory exists
    const dirPath = dirname(filePath);
    await promises.mkdir(dirPath, { recursive: true });

    // Check if the item is a directory or a file
    if (fileData.length === 0) {
      continue;
    }

    // Write the file data to disk
    await promises.writeFile(filePath, new Uint8Array(fileData)); // Endret fra Buffer til Uint8Array

    console.timeLog("Timer", "Extraction complete");
  }
}

async function processSubjectCodes() {
  type FileContent = {
    id: string;
    kode: string;
    tittel: { spraak: Language; verdi: string }[];
    status: Status | string | null;
    "sist-endret": string | null;
    merkelapper: { kode: Label; verdi: boolean }[];
    opplaeringsfag: { kode: string; status: string } | null;
    fagtype: SubjectType | null;
    opplaeringsnivaa: EducationLevel | null;
    spraaknivaa: string;
  };

  const SUBJECT_CODES_PATH = `${FILES_PATH}/fagkoder`;

  // Check if the subject codes folder exists
  const subjectCodesFolderExists = await new Promise<boolean>((resolve) => {
    access(SUBJECT_CODES_PATH, constants.F_OK, (err) => {
      resolve(!err);
    });
  });

  // Throw an error if the subject codes folder doesn't exist
  if (!subjectCodesFolderExists) {
    console.timeLog("Timer", "Subject codes folder doesn't exist");
    throw new Error("Subject codes folder doesn't exist");
  }

  // Get list of files in the subject codes folder
  const files = await promises.readdir(SUBJECT_CODES_PATH);

  // Endre denne linjen
  const subjectCodesSet = new Set<ProcessedSubject>();

  // Function to process a file
  async function processFile(file: string) {
    // console.timeLog("Timer", `Processing subject: ${file}`);

    // Check if the processed folder exists
    const processedFolderExists = await new Promise<boolean>((resolve) => {
      access(PROCESSED_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    });
    // Create the processed folder if it doesn't exist
    if (!processedFolderExists) {
      await promises.mkdir(PROCESSED_PATH, { recursive: true });
    }

    const filePath = `${SUBJECT_CODES_PATH}/${file}`;

    // Read the JSON file
    const fileData: FileContent = await promises
      .readFile(filePath, "utf-8")
      .then((data) => JSON.parse(data));

    // Convert array to record
    const name = fileData.tittel.reduce((acc, title) => {
      acc[title.spraak] = title.verdi;
      return acc;
    }, {} as Title);

    // Konverter status til riktig type
    const status =
      (fileData.status?.replace(
        "https://data.udir.no/kl06/v201906/status/status_",
        ""
      ) as Status) || null;

    // Konverter merkelapper array til record
    const labels =
      fileData.merkelapper.reduce((acc, label) => {
        acc[label.kode] = label.verdi ?? true; // Sett verdi til true hvis den er undefined
        return acc;
      }, {} as Labels) || null;

    // const educationalsubject =
    //   fileData.opplaeringsfag?.reduce((acc, subject) => {
    //     acc[subject.kode] = subject.tittel;
    //     return acc;
    //   }, {} as Record<string, string>) || null;
    if (
      fileData.status ===
      "https://data.udir.no/kl06/v201906/status/status_publisert"
    ) {
      if (Array.isArray(fileData.opplaeringsfag)) {
        for (const eduSub of fileData.opplaeringsfag) {
          if (
            eduSub.status ===
            "https://data.udir.no/kl06/v201906/status/status_publisert"
          ) {
            subjectsToEducationalSubjects.push({
              subjects_id: fileData.id.replace("uuid:", ""),
              educational_subjects_id: eduSub.id.replace("uuid:", ""),
            });
          }
        }
      }
    }

    const subjectObject: ProcessedSubject = {
      id: fileData.id.replace("uuid:", ""),
      code: fileData.kode,
      title: name,
      status: status,
      last_changed: fileData["sist-endret"] || null,
      labels: labels,
      // educational_subject: educationalsubject,
      subject_type: fileData.fagtype as SubjectType,
      education_level: fileData.opplaeringsnivaa as EducationLevel,
    };

    // Add the subject to the set, if it's a high school subject
    if (status === "publisert") {
      subjectCodesSet.add(subjectObject);
    }

    // Simulate writing to a database (200-400ms delay)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * (400 - 200 + 1)) + 200)
    );
  }

  // Process files concurrently, with a maximum of 100 at a time
  await pMap(files, processFile, { concurrency: 100 });

  // Etter at alle filer er behandlet, oppdater den globale variabelen
  subjectCodeData = Array.from(subjectCodesSet);

  // Lagre den behandlede dataen til en JSON-fil
  await promises.writeFile(
    `${PROCESSED_PATH}/subjects.json`,
    JSON.stringify(subjectCodeData, null, 2)
  );
  await promises.writeFile(
    `${PROCESSED_PATH}/subjectsToEducationalSubjects.json`,
    JSON.stringify(subjectsToEducationalSubjects, null, 2)
  );

  console.log("koblet", subjectsToEducationalSubjects.length);
  console.log("Ikke koblet", subjectCodeData.length);
  // console.timeLog("Timer", "Subject codes processed");
}

async function processEducationalSubjects() {
  type FileContent = {
    id: string;
    "fagkode-referanser": { kode: string; status: string }[];
    "laereplan-referanse": { kode: string; status: string }[];
    kode: string;
    tittel: { spraak: Language; verdi: string }[];
    status: Status | null;
    "sist-endret": string | null;
    fagtype: { kode: SubjectType; status: string } | null;
    opplaeringsnivaa: { kode: EducationLevel; status: string } | null;
    "for-aarstrinn": { kode: Year; status: string }[];
  };

  const EDUCATIONAL_SUBJECTS_PATH = `${FILES_PATH}/opplaeringsfag`;

  // Check if the educational subjects folder exists
  const educationalSubjectsFolderExists = await new Promise<boolean>(
    (resolve) => {
      access(EDUCATIONAL_SUBJECTS_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    }
  );

  // Throw an error if the educational subjects folder doesn't exist
  if (!educationalSubjectsFolderExists) {
    console.timeLog("Timer", "Educational subjects folder doesn't exist");
    throw new Error("Educational subjects folder doesn't exist");
  }

  // Get list of files in the educational subjects folder
  const files = await promises.readdir(EDUCATIONAL_SUBJECTS_PATH);

  // Endre denne linjen
  const educationalSubjectsSet = new Set<ProcessedEducationalSubject>();

  async function processFile(file: string) {
    // console.timeLog("Timer", `Processing educational subject: ${file}`);

    // Check if the processed folder exists
    const processedFolderExists = await new Promise<boolean>((resolve) => {
      access(PROCESSED_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    });
    // Create the processed folder if it doesn't exist
    if (!processedFolderExists) {
      await promises.mkdir(PROCESSED_PATH, { recursive: true });
    }

    const filePath = `${EDUCATIONAL_SUBJECTS_PATH}/${file}`;

    // Read the JSON file
    const fileData: FileContent = await promises
      .readFile(filePath, "utf-8")
      .then((data) => JSON.parse(data));

    // Convert array to record
    const name = fileData.tittel.reduce((acc, title) => {
      acc[title.spraak] = title.verdi;
      return acc;
    }, {} as Title);

    // Konverter status til riktig type
    const status =
      (fileData.status?.replace(
        "https://data.udir.no/kl06/v201906/status/status_",
        ""
      ) as Status) || null;

    // Konverter fagkode-referanser array til record
    const subjectCodeId =
      fileData["fagkode-referanser"].length > 1
        ? [
            fileData["fagkode-referanser"]
              .filter(
                (subject) =>
                  subject.status ===
                  "https://data.udir.no/kl06/v201906/status/status_publisert"
              )
              .map((subject) => subject.kode)
              .join(", "),
          ]
        : fileData["fagkode-referanser"]
            .filter(
              (subject) =>
                subject.status ===
                "https://data.udir.no/kl06/v201906/status/status_publisert"
            )
            .map((subject) => subject.kode)
            .join(", ");

    // Konverter laereplan-referanse array til record
    const curriculumId =
      fileData["laereplan-referanse"].filter(
        (subject) =>
          subject.status ===
          "https://data.udir.no/kl06/v201906/status/status_publisert"
      ).length > 1
        ? [
            fileData["laereplan-referanse"]
              .filter(
                (subject) =>
                  subject.status ===
                  "https://data.udir.no/kl06/v201906/status/status_publisert"
              )
              .map((subject) => subject.kode)
              .join(", "),
          ]
        : fileData["laereplan-referanse"]
            .filter(
              (subject) =>
                subject.status ===
                "https://data.udir.no/kl06/v201906/status/status_publisert"
            )
            .map((subject) => subject.kode)
            .join(", ");

    const subjectType = Array.isArray(fileData.fagtype)
      ? fileData.fagtype
          .filter(
            (subject: any) =>
              subject.status ===
              "https://data.udir.no/kl06/v201906/status/status_publisert"
          )
          .map((subject: any) => subject.kode)
      : fileData.fagtype?.status ===
        "https://data.udir.no/kl06/v201906/status/status_publisert"
      ? fileData.fagtype.kode
      : [];

    const educationLevel = Array.isArray(fileData.opplaeringsnivaa)
      ? fileData.opplaeringsnivaa
          .filter(
            (subject: any) =>
              subject.status ===
              "https://data.udir.no/kl06/v201906/status/status_publisert"
          )
          .map((subject: any) => subject.kode)
      : fileData.opplaeringsnivaa?.status ===
        "https://data.udir.no/kl06/v201906/status/status_publisert"
      ? fileData.opplaeringsnivaa.kode
      : [];

    const yearLevel: YearLevel | YearLevel[] =
      fileData["for-aarstrinn"].filter(
        (subject) =>
          subject.status ===
          "https://data.udir.no/kl06/v201906/status/status_publisert"
      ).length > 1
        ? fileData["for-aarstrinn"]
            .filter(
              (subject) =>
                subject.status ===
                "https://data.udir.no/kl06/v201906/status/status_publisert"
            )
            .map((subject) => ({ "Year Level": subject.kode }))
        : {
            "Year Level": fileData["for-aarstrinn"].filter(
              (subject) =>
                subject.status ===
                "https://data.udir.no/kl06/v201906/status/status_publisert"
            )[0]?.kode, // Bruker den første elementets kode
          };

    let id = null;

    const educationalSubjectObject: ProcessedEducationalSubject = {
      id: fileData.id.replace("uuid:", ""),
      // subject_code_id: subjectCodeId,
      // curriculum_id: curriculumId,
      code: fileData.kode,
      title: name,
      status: status,
      last_changed: fileData["sist-endret"] || null,
      subject_type: subjectType,
      education_level: educationLevel,
      year_level: yearLevel,
    };

    // Add the subject to the set, if it's a high school subject
    if (status === "publisert") {
      educationalSubjectsSet.add(educationalSubjectObject);
    }

    // Simulate writing to a database (200-400ms delay)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * (400 - 200 + 1)) + 200)
    );
  }

  // Process files concurrently, with a maximum of 100 at a time
  await pMap(files, processFile, { concurrency: 100 });

  // Etter at alle filer er behandlet, oppdater den globale variabelen
  educationalSubjectData = Array.from(educationalSubjectsSet);

  // Lagre den behandlede dataen til en JSON-fil
  await promises.writeFile(
    `${PROCESSED_PATH}/educational_subjects.json`,
    JSON.stringify(educationalSubjectData, null, 2)
  );

  // console.timeLog("Timer", "Educational subjects processed");
}

async function processCurricula() {
  type FileContent = {
    id: string;
    kode: string;
    tittel: { tekst: { spraak: Language; verdi: string }[] };
    status: Status | null;
    "sist-endret": string | null;
    laereplanstruktur: { tittel: CurriculumStructure; status: string } | null;
    fagtype: { kode: SubjectType; status: string } | null;
    "grep-type": string;
    "kompetansemaal-kapittel": {
      kompetansemaalsett: { kode: string; status: string; "grep-type": string };
    } | null;
    "fagkode-referanse": null;
  };

  const CURRICULUM_PATH = `${FILES_PATH}/laereplaner`;
  const CURRICULUM_LK20_PATH = `${FILES_PATH}/laereplaner-LK20`;

  // Check if the curriculum folder exists
  const curriculumFolderExists = await new Promise<boolean>((resolve) => {
    access(CURRICULUM_PATH, constants.F_OK, (err) => {
      resolve(!err);
    });
  });

  // Throw an error if the curriculum folder doesn't exist
  if (!curriculumFolderExists) {
    console.timeLog("Timer", "Curriculum folder doesn't exist");
    throw new Error("Curriculum folder doesn't exist");
  }

  console.timeLog("Timer", "Combining curricula into a single folder");
  // Opprett en ny mappe for å lagre alle JSON-filene
  COMBINED_CURRICULUM_PATH = `${FILES_PATH}/curricula`;
  await promises.mkdir(COMBINED_CURRICULUM_PATH, { recursive: true });

  // Hent liste over filer i begge mappene
  const lk_06_files = await promises.readdir(CURRICULUM_PATH);
  const lk_20_files = await promises.readdir(CURRICULUM_LK20_PATH);

  // Flytt JSON-filer fra LK06-mappen til den kombinerte mappen
  for (const file of lk_06_files) {
    if (file.endsWith(".json")) {
      await promises.rename(
        `${CURRICULUM_PATH}/${file}`,
        `${COMBINED_CURRICULUM_PATH}/${file}`
      );
    }
  }

  // Flytt JSON-filer fra LK20-mappen til den kombinerte mappen
  for (const file of lk_20_files) {
    if (file.endsWith(".json")) {
      await promises.rename(
        `${CURRICULUM_LK20_PATH}/${file}`,
        `${COMBINED_CURRICULUM_PATH}/${file}`
      );
    }
  }

  // Hent liste over filer i den kombinerte mappen
  const files = await promises.readdir(COMBINED_CURRICULUM_PATH);
  console.timeLog("Timer", "Curriculum folder combined");

  // Create a set to store the processed curriculum data
  const curriculumSet = new Set<ProcessedCurriculum>();

  async function processFile(file: string) {
    // console.timeLog("Timer", `Processing curriculum: ${file}`);

    // Check if the processed folder exists
    const processedFolderExists = await new Promise<boolean>((resolve) => {
      access(PROCESSED_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    });
    // Create the processe d folder if it doesn't exist
    if (!processedFolderExists) {
      await promises.mkdir(PROCESSED_PATH, { recursive: true });
    }

    // Endre filbanen til den kombinerte mappen
    const filePath = `${COMBINED_CURRICULUM_PATH}/${file}`;

    // Read the JSON file
    const fileData: FileContent = await promises
      .readFile(filePath, "utf-8")
      .then((data) => JSON.parse(data));

    // Konverter status til riktig type
    const status =
      (fileData.status?.replace(
        "https://data.udir.no/kl06/v201906/status/status_",
        ""
      ) as Status) || null;

    const curriculumStructure = fileData.laereplanstruktur
      ?.tittel as CurriculumStructure;

    const subjectType = Array.isArray(fileData.fagtype)
      ? fileData.fagtype
          .filter(
            (subject: any) =>
              subject.status ===
              "https://data.udir.no/kl06/v201906/status/status_publisert"
          )
          .map((subject: any) => subject.kode as SubjectType)
      : fileData.fagtype?.status ===
        "https://data.udir.no/kl06/v201906/status/status_publisert"
      ? (fileData.fagtype.kode as SubjectType)
      : [];

    let competenceGoalSet: string | string[] | null = null;
    const kompetansemaalsett =
      fileData["kompetansemaal-kapittel"]?.kompetansemaalsett;

    let educational_subject_reference: { code: string; title: Title }[] = [];
    let subject_code_reference: Record<string, Title>[] = [];

    if (kompetansemaalsett) {
      if (Array.isArray(kompetansemaalsett)) {
        competenceGoalSet = kompetansemaalsett
          .filter(
            (subject) =>
              subject.status ===
              "https://data.udir.no/kl06/v201906/status/status_publisert"
          )
          .map((subject) => subject.kode);

        for (const km of kompetansemaalsett) {
          const kmFilePath = `${FILES_PATH}/competence_goal_sets/${km.kode}.json`;
          try {
            const kmData = JSON.parse(
              await promises.readFile(kmFilePath, "utf8")
            );

            if (
              Array.isArray(kmData["etter-fag"]) &&
              kmData["etter-fag"].length > 0
            ) {
              for (const etterFag of kmData["etter-fag"]) {
                const grepType = etterFag["grep-type"]?.replace(
                  "http://psi.udir.no/ontologi/kl06/",
                  ""
                );
                const status = etterFag.status?.replace(
                  "https://data.udir.no/kl06/v201906/status/status_",
                  ""
                );

                if (grepType === "opplaeringsfag" && status === "publisert") {
                  const opplaeringsfagKode = etterFag.kode;
                  const EDUCATIONAL_SUBJECTS_PATH = `${FILES_PATH}/opplaeringsfag/${opplaeringsfagKode}.json`;
                  try {
                    const opplaeringsfagData = JSON.parse(
                      await promises.readFile(EDUCATIONAL_SUBJECTS_PATH, "utf8")
                    );

                    const title = opplaeringsfagData.tittel.reduce(
                      (acc: any, item: any) => {
                        acc[item.spraak] = item.verdi; // Sett verdi basert på språket
                        return acc;
                      },
                      {} as Title
                    );

                    // Fjern tomme strenger
                    Object.keys(title).forEach((key) => {
                      if (title[key as keyof Title] === "") {
                        delete title[key as keyof Title];
                      }
                    });

                    educational_subject_reference.push({
                      code: opplaeringsfagKode,
                      title: title,
                    });

                    if (
                      Array.isArray(opplaeringsfagData["fagkode-referanser"])
                    ) {
                      for (const fagkode of opplaeringsfagData[
                        "fagkode-referanser"
                      ]) {
                        const publishedSubjectCodes =
                          await fetchPublishedSubjectCodes(fagkode.kode);
                        if (publishedSubjectCodes) {
                          subject_code_reference.push({
                            code: publishedSubjectCodes.code,
                            title: publishedSubjectCodes.title,
                          });
                        }
                      }
                    }
                  } catch (error) {
                    console.error(
                      `Kunne ikke lese eller parse filen for opplaeringsfag ${opplaeringsfagKode}:`,
                      error
                    );
                  }
                }
              }
            }
          } catch (error) {
            console.error(
              `Kunne ikke lese eller parse filen for kompetansemaalsett ${km.kode}:`,
              error
            );
          }
        }

        competenceGoalSet =
          competenceGoalSet.length === 0
            ? kompetansemaalsett.kode
            : competenceGoalSet.length === 1
            ? competenceGoalSet[0]
            : competenceGoalSet;
      } else if (
        kompetansemaalsett.status ===
        "https://data.udir.no/kl06/v201906/status/status_publisert"
      ) {
        competenceGoalSet = kompetansemaalsett.kode;
      }
    }

    // Fjern URL-dataen og få ut type
    const curriculumType = fileData["grep-type"].replace(
      "http://psi.udir.no/ontologi/kl06/",
      ""
    );

    let name: Partial<Title> = {};

    // Hvis det er en LK20-læreplan, bruk tittelen fra LK20-filen
    if (curriculumType === "laereplan_lk20") {
      if (
        fileData.tittel &&
        fileData.tittel.tekst &&
        Array.isArray(fileData.tittel.tekst)
      ) {
        fileData.tittel.tekst.forEach((title) => {
          if (title && title.spraak && title.verdi) {
            (name as any)[title.spraak] = title.verdi;
          }
        });
      }
      // Hvis det ikke er en LK20-læreplan, bruk tittelen fra LK06-filen
    } else if (curriculumType === "laereplan") {
      if (Array.isArray(fileData.tittel)) {
        fileData.tittel.forEach((title) => {
          if (title && title.spraak && title.verdi) {
            (name as any)[title.spraak] = title.verdi;
          }
        });
      }
    }

    // Konverter til full Title type
    const fullName: Title = {
      default: name.default || "",
      eng: name.eng || "",
      nno: name.nno || "",
      nob: name.nob || "",
      sme: name.sme || "",
      deu: name.deu || "",
      sma: name.sma || "",
      smj: name.smj || "",
      fra: name.fra || "",
      ita: name.ita || "",
      spa: name.spa || "",
    };

    // Fjern tomme strenger
    Object.keys(fullName).forEach((key) => {
      if (fullName[key as keyof Title] === "") {
        delete fullName[key as keyof Title];
      }
    });

    let id = null;

    const curriculumObject: ProcessedCurriculum = {
      // id: id,
      code: fileData.kode,
      title: fullName,
      status: status,
      last_changed: fileData["sist-endret"] || null,
      curriculum_structure: curriculumStructure,
      subject_type: subjectType,
      curriculum_type: curriculumType,
      // competence_goal_set_reference: competenceGoalSet,
      // subject_code_reference: subject_code_reference,
      // educational_subject_reference: educational_subject_reference,
    };

    // Add the curriculum to the set, if it's a high school curriculum
    if (status === "publisert") {
      curriculumSet.add(curriculumObject);
    }

    // Simulate writing to a database (200-400ms delay)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * (400 - 200 + 1)) + 200)
    );
  }

  // Behandle filer samtidig, med maksimalt 100 om gangen
  await pMap(files, processFile, { concurrency: 100 });

  // Etter at alle filer er behandlet, oppdater den globale variabelen
  curriculumData = Array.from(curriculumSet);

  // Lagre den behandlede dataen til en JSON-fil
  await promises.writeFile(
    `${PROCESSED_PATH}/curricula.json`,
    JSON.stringify(curriculumData, null, 2)
  );

  // console.timeLog("Timer", "Curriculum processed");
}

async function processCompetenceGoalSets() {
  type FileContent = {
    id: string;
    kode: string;
    tittel: { tekst: { spraak: Language; verdi: string }[] };
    status: Status | null;
    "sist-endret": string | null;
    "grep-type": string;
    kompetansemaal: {
      kode: string;
      status: string;
      grep_type: string;
      tittel: string;
    }[];
    "etter-fag": {
      kode: string;
      tittel: string;
      status: string;
    }[];
    "etter-aarstrinn": {
      kode: string;
      status: string;
    }[];
  };

  const COMPETENCE_GOAL_SET_PATH = `${FILES_PATH}/kompetansemaalsett`;
  const COMPETENCE_GOAL_SET_LK20_PATH = `${FILES_PATH}/kompetansemaalsett-lk20`;

  // Check if the curriculum folder exists
  const competenceGoalSetFolderExists = await new Promise<boolean>(
    (resolve) => {
      access(COMPETENCE_GOAL_SET_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    }
  );
  const competenceGoalSetLK20FolderExists = await new Promise<boolean>(
    (resolve) => {
      access(COMPETENCE_GOAL_SET_LK20_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    }
  );

  // Throw an error if the competence goal set folder doesn't exist
  if (!competenceGoalSetFolderExists) {
    console.timeLog("Timer", "Competence goal set folder doesn't exist");
    throw new Error("Competence goal set folder doesn't exist");
  }
  if (!competenceGoalSetLK20FolderExists) {
    console.timeLog("Timer", "Competence goal set LK20 folder doesn't exist");
    throw new Error("Competence goal set LK20 folder doesn't exist");
  }

  console.timeLog(
    "Timer",
    "Combining competence goal sets into a single folder"
  );
  // Opprett en ny mappe for å lagre alle JSON-filene
  COMBINED_COMPETENCE_GOAL_SETS_PATH = `${FILES_PATH}/competence_goal_sets`;
  await promises.mkdir(COMBINED_COMPETENCE_GOAL_SETS_PATH, { recursive: true });

  // Hent liste over filer i begge mappene
  const lk_06_files = await promises.readdir(COMPETENCE_GOAL_SET_PATH);
  const lk_20_files = await promises.readdir(COMPETENCE_GOAL_SET_LK20_PATH);

  // Flytt JSON-filer fra LK06-mappen til den kombinerte mappen
  for (const file of lk_06_files) {
    if (file.endsWith(".json")) {
      await promises.rename(
        `${COMPETENCE_GOAL_SET_PATH}/${file}`,
        `${COMBINED_COMPETENCE_GOAL_SETS_PATH}/${file}`
      );
    }
  }

  // Flytt JSON-filer fra LK20-mappen til den kombinerte mappen
  for (const file of lk_20_files) {
    if (file.endsWith(".json")) {
      await promises.rename(
        `${COMPETENCE_GOAL_SET_LK20_PATH}/${file}`,
        `${COMBINED_COMPETENCE_GOAL_SETS_PATH}/${file}`
      );
    }
  }

  // Hent liste over filer i den kombinerte mappen
  const files = await promises.readdir(COMBINED_COMPETENCE_GOAL_SETS_PATH);
  console.timeLog("Timer", "Competence goal set folder combined");

  const competenceGoalSetsSet = new Set<ProcessedCompetenceGoalSet>();

  async function processFile(file: string) {
    // console.timeLog("Timer", `Processing competence goal set: ${file}`);

    // Check if the processed folder exists
    const processedFolderExists = await new Promise<boolean>((resolve) => {
      access(PROCESSED_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    });
    // Create the processed folder if it doesn't exist
    if (!processedFolderExists) {
      await promises.mkdir(PROCESSED_PATH, { recursive: true });
    }

    const filePath = `${COMBINED_COMPETENCE_GOAL_SETS_PATH}/${file}`;

    // Read the JSON file
    const fileData: FileContent = await promises
      .readFile(filePath, "utf-8")
      .then((data) => JSON.parse(data));

    // Konverter status til riktig type
    const status =
      (fileData.status?.replace(
        "https://data.udir.no/kl06/v201906/status/status_",
        ""
      ) as Status) || null;

    const competenceGoalSetType = fileData["grep-type"].replace(
      "http://psi.udir.no/ontologi/kl06/",
      ""
    );

    let name: Partial<Title> = {};

    // Hvis det er en LK20-læreplan, bruk tittelen fra LK20-filen
    if (competenceGoalSetType === "kompetansemaalsett_lk20") {
      if (
        fileData.tittel &&
        fileData.tittel.tekst &&
        Array.isArray(fileData.tittel.tekst)
      ) {
        fileData.tittel.tekst.forEach((title) => {
          if (title && title.spraak && title.verdi) {
            (name as any)[title.spraak] = title.verdi;
          }
        });
      }
      // Hvis det ikke er en LK20-læreplan, bruk tittelen fra LK06-filen
    } else if (competenceGoalSetType === "kompetansemaalsett") {
      if (Array.isArray(fileData.tittel)) {
        fileData.tittel.forEach((title) => {
          if (title && title.spraak && title.verdi) {
            (name as any)[title.spraak] = title.verdi;
          }
        });
      }
    }

    // Konverter til full Title type
    const fullName: Title = {
      default: name.default || "",
      eng: name.eng || "",
      nno: name.nno || "",
      nob: name.nob || "",
      sme: name.sme || "",
      deu: name.deu || "",
      sma: name.sma || "",
      smj: name.smj || "",
      fra: name.fra || "",
      ita: name.ita || "",
      spa: name.spa || "",
    };

    // Fjern tomme strenger
    Object.keys(fullName).forEach((key) => {
      if (fullName[key as keyof Title] === "") {
        delete fullName[key as keyof Title];
      }
    });

    const competenceGoalReference = fileData.kompetansemaal
      .filter(
        (competenceGoal) =>
          competenceGoal.status ===
          "https://data.udir.no/kl06/v201906/status/status_publisert"
      )
      .map((competenceGoal) => ({
        code: competenceGoal.kode,
        title: competenceGoal.tittel,
      })) as CompetenceGoal[];

    const curriculumReference = fileData["etter-fag"]
      .filter(
        (curriculum) =>
          curriculum.status ===
          "https://data.udir.no/kl06/v201906/status/status_publisert"
      )
      .map((curriculum) => ({
        code: curriculum.kode,
        title: curriculum.tittel,
      })) as CurriculumReference[];

    const educationalSubjectReference = fileData["etter-fag"]
      .filter(
        (educationalSubject) =>
          educationalSubject.status ===
          "https://data.udir.no/kl06/v201906/status/status_publisert"
      )
      .map((educationalSubject) => ({
        code: educationalSubject.kode,
        title: educationalSubject.tittel,
      })) as EducationalSubjectReference[];

    // Les educational_subjects.json fra ./tmp/processed
    const educationalSubjectsData = JSON.parse(
      await promises.readFile(
        `${PROCESSED_PATH}/educational_subjects.json`,
        "utf8"
      )
    );

    // Finn subject_code_id fra educational_subjects.json
    const subjectCodeId = educationalSubjectReference
      .map((subject) => {
        const matchingSubject = educationalSubjectsData.find(
          (data: any) => data.code === subject.code
        );
        return matchingSubject ? matchingSubject.subject_code_id : null;
      })
      .filter((id) => id !== null);

    // Fjern duplikater og flatten arrayet hvis nødvendig
    const uniqueSubjectCodeId = [...new Set(subjectCodeId.flat())];

    let id = null;

    const competenceGoalSetObject: ProcessedCompetenceGoalSet = {
      // id: id,
      code: fileData.kode,
      title: fullName,
      status: status,
      last_changed: fileData["sist-endret"] || null,
      // subject_code_reference: uniqueSubjectCodeId, // subject_code.kode
      // competence_goal_reference: competenceGoalReference, // kompetansemaal.kode
      // educational_subject_reference: educationalSubjectReference, // fagkode.kode
      // curriculum_reference: curriculumReference, // laereplan.kode
    };

    // Add the curriculum to the set, if it's a high school curriculum
    if (status === "publisert") {
      competenceGoalSetsSet.add(competenceGoalSetObject);
    }

    // Simulate writing to a database (200-400ms delay)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * (400 - 200 + 1)) + 200)
    );
  }
  // Behandle filer samtidig, med maksimalt 100 om gangen
  await pMap(files, processFile, { concurrency: 100 });

  // Etter at alle filer er behandlet, oppdater den globale variabelen
  competenceGoalSetsData = Array.from(competenceGoalSetsSet);

  // Lagre den behandlede dataen til en JSON-fil
  await promises.writeFile(
    `${PROCESSED_PATH}/competence_goal_sets.json`,
    JSON.stringify(competenceGoalSetsData, null, 2)
  );

  // console.timeLog("Timer", "Competence goal set processed");
}

async function processCompetenceGoals() {
  type FileContent = {
    id: string;
    kode: string;
    tittel: { tekst: { spraak: Language; verdi: string }[] };
    status: Status | null;
    "sist-endret": string | null;
    "grep-type": string;
    "tilknyttede-tverrfaglige-temaer": {
      referanse: { kode: string; tittel: string; status: string }[];
    };
    "tilknyttede-kjerneelementer": {
      referanse: { kode: string; tittel: string; status: string }[];
    };
    "tilhoerer-kompetansemaalsett": {
      kode: string;
      tittel: string;
      status: string;
    };
    "tilhoerer-laereplan": {
      kode: string;
      tittel: string;
      status: string;
    };
    "laereplan-referanser": {
      status: string;
      "grep-type": string;
      kode: string;
      "tilhoerende-kompetansemaalsett": {
        kode: string;
        tittel: string;
        status: string;
      };
    };
  };

  const COMPETENCE_GOAL_PATH = `${FILES_PATH}/kompetansemaal`;
  const COMPETENCE_GOAL_LK20_PATH = `${FILES_PATH}/kompetansemaal-lk20`;

  // Check if the curriculum folder exists
  const competenceGoalFolderExists = await new Promise<boolean>((resolve) => {
    access(COMPETENCE_GOAL_PATH, constants.F_OK, (err) => {
      resolve(!err);
    });
  });
  const competenceGoalLK20FolderExists = await new Promise<boolean>(
    (resolve) => {
      access(COMPETENCE_GOAL_LK20_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    }
  );
  if (!competenceGoalFolderExists) {
    console.timeLog("Timer", "Competence goal folder doesn't exist");
    throw new Error("Competence goal folder doesn't exist");
  }
  if (!competenceGoalLK20FolderExists) {
    console.timeLog("Timer", "Competence goal LK20 folder doesn't exist");
    throw new Error("Competence goal LK20 folder doesn't exist");
  }

  console.timeLog("Timer", "Combining competence goals into a single folder");
  // Opprett en ny mappe for å lagre alle JSON-filene
  COMBINED_COMPETENCE_GOAL_PATH = `${FILES_PATH}/competence_goals`;
  await promises.mkdir(COMBINED_COMPETENCE_GOAL_PATH, { recursive: true });

  // Hent liste over filer i begge mappene
  const lk_06_files = await promises.readdir(COMPETENCE_GOAL_PATH);
  const lk_20_files = await promises.readdir(COMPETENCE_GOAL_LK20_PATH);

  // Flytt JSON-filer fra LK06-mappen til den kombinerte mappen
  for (const file of lk_06_files) {
    if (file.endsWith(".json")) {
      await promises.rename(
        `${COMPETENCE_GOAL_PATH}/${file}`,
        `${COMBINED_COMPETENCE_GOAL_PATH}/${file}`
      );
    }
  }

  // Flytt JSON-filer fra LK20-mappen til den kombinerte mappen
  for (const file of lk_20_files) {
    if (file.endsWith(".json")) {
      await promises.rename(
        `${COMPETENCE_GOAL_LK20_PATH}/${file}`,
        `${COMBINED_COMPETENCE_GOAL_PATH}/${file}`
      );
    }
  }

  // Hent liste over filer i den kombinerte mappen
  const files = await promises.readdir(COMBINED_COMPETENCE_GOAL_PATH);
  // console.timeLog("Timer", "Competence goal set folder combined");

  // Endre denne linjen
  const competenceGoalSet = new Set<ProcessedCompetenceGoal>();

  async function processFile(file: string) {
    // console.timeLog("Timer", `Processing competence goal: ${file}`);

    // Check if the processed folder exists
    const processedFolderExists = await new Promise<boolean>((resolve) => {
      access(PROCESSED_PATH, constants.F_OK, (err) => {
        resolve(!err);
      });
    });
    // Create the processed folder if it doesn't exist
    if (!processedFolderExists) {
      await promises.mkdir(PROCESSED_PATH, { recursive: true });
    }

    const filePath = `${COMBINED_COMPETENCE_GOAL_PATH}/${file}`;

    // Read the JSON file
    const fileData: FileContent = await promises
      .readFile(filePath, "utf-8")
      .then((data) => JSON.parse(data));

    // Konverter status til riktig type
    const status =
      (fileData.status?.replace(
        "https://data.udir.no/kl06/v201906/status/status_",
        ""
      ) as Status) || null;

    const competenceGoalType = fileData["grep-type"].replace(
      "http://psi.udir.no/ontologi/kl06/",
      ""
    );

    let name: Partial<Title> = {};

    // Hvis det er en LK20-læreplan, bruk tittelen fra LK20-filen
    if (competenceGoalType === "kompetansemaal_lk20") {
      if (
        fileData.tittel &&
        fileData.tittel.tekst &&
        Array.isArray(fileData.tittel.tekst)
      ) {
        fileData.tittel.tekst.forEach((title) => {
          if (title && title.spraak && title.verdi) {
            (name as any)[title.spraak] = title.verdi;
          }
        });
      }
      // Hvis det ikke er en LK20-læreplan, bruk tittelen fra LK06-filen
    }
    // Hvis det er en LK06-læreplan, bruk tittelen fra LK06-filen
    else if (competenceGoalType === "kompetansemaal") {
      if (Array.isArray(fileData.tittel)) {
        fileData.tittel.forEach((title) => {
          if (title && title.spraak && title.verdi) {
            (name as any)[title.spraak] = title.verdi;
          }
        });
      }
    }
    // Konverter til full Title type
    const fullName: Title = {
      default: name.default || "",
      eng: name.eng || "",
      nno: name.nno || "",
      nob: name.nob || "",
      sme: name.sme || "",
      deu: name.deu || "",
      sma: name.sma || "",
      smj: name.smj || "",
      fra: name.fra || "",
      ita: name.ita || "",
      spa: name.spa || "",
    };
    // Fjern tomme strenger
    Object.keys(fullName).forEach((key) => {
      if (fullName[key as keyof Title] === "") {
        delete fullName[key as keyof Title];
      }
    });

    // Funker bare på lk-20 må kokkelere opp lk-06 if funksjon
    let competenceGoalSetReference: CompetenceGoalSetReference[] | null = [];
    if (Array.isArray(fileData["tilhoerer-kompetansemaalsett"])) {
      competenceGoalSetReference = [];

      for (const competenceGoalSet of fileData[
        "tilhoerer-kompetansemaalsett"
      ]) {
        if (
          competenceGoalSet.status ===
          "https://data.udir.no/kl06/v201906/status/status_publisert"
        ) {
          const competenceGoalSetCode = competenceGoalSet.kode;
          const competenceGoalSetFilePath = `${COMBINED_COMPETENCE_GOAL_SETS_PATH}/${competenceGoalSetCode}.json`;

          // Les kompetansemålsett filen for å hente tittel
          const competenceGoalSetData = JSON.parse(
            await promises.readFile(competenceGoalSetFilePath, "utf8")
          );
          const title = competenceGoalSetData.tittel.tekst.reduce(
            (acc: any, item: any) => {
              acc[item.spraak] = item.verdi; // Sett verdi basert på språket
              return acc;
            },
            {} as Title
          );

          // Fjern tomme strenger
          Object.keys(title).forEach((key) => {
            if (title[key as keyof Title] === "") {
              delete title[key as keyof Title];
            }
          });

          competenceGoalSetReference.push({
            code: competenceGoalSetCode,
            title: title,
          });
        }
      }
    } else if (fileData["tilhoerer-kompetansemaalsett"]) {
      const competenceGoalSetCode =
        fileData["tilhoerer-kompetansemaalsett"].kode;
      const competenceGoalSetFilePath = `${COMBINED_COMPETENCE_GOAL_SETS_PATH}/${competenceGoalSetCode}.json`;

      // Les kompetansemålsett filen for å hente tittel
      const competenceGoalSetData = JSON.parse(
        await promises.readFile(competenceGoalSetFilePath, "utf8")
      );
      const title = competenceGoalSetData.tittel.tekst.reduce(
        (acc: any, item: any) => {
          acc[item.spraak] = item.verdi; // Sett verdi basert på språket
          return acc;
        },
        {} as Title
      );

      // Fjern tomme strenger
      Object.keys(title).forEach((key) => {
        if (title[key as keyof Title] === "") {
          delete title[key as keyof Title];
        }
      });

      competenceGoalSetReference = [
        {
          code: competenceGoalSetCode,
          title: title,
        },
      ];
    }
    // Tilhører læreplan
    let curriculumReference: CurriculumReference[] | null = [];
    let curriculumLK06: { kode: string }[] = [];
    if (Array.isArray(fileData["laereplan-referanser"])) {
      for (const laereplanReferanse of fileData["laereplan-referanser"]) {
        const grepType = laereplanReferanse["grep-type"]?.replace(
          "http://psi.udir.no/ontologi/kl06/",
          ""
        );
        const referanseStatus = laereplanReferanse.status?.replace(
          "https://data.udir.no/kl06/v201906/status/status_",
          ""
        );
        if (grepType === "laereplan" && referanseStatus === "utgaatt") {
          const laereplanKode = laereplanReferanse.kode;
          const LAEREPLAN_FILE_PATH = `${COMBINED_CURRICULUM_PATH}/${laereplanKode}.json`;
          try {
            const laereplanData = JSON.parse(
              await promises.readFile(LAEREPLAN_FILE_PATH, "utf8")
            );
            if (
              laereplanData["erstattes-av"] &&
              laereplanData["erstattes-av"].length > 0
            ) {
              // Hent "erstattet-av" og kall fetchPublishedCurriculum for hver
              for (const erstattetAv of laereplanData["erstattes-av"]) {
                const publishedCurriculum = await fetchPublishedCurriculum(
                  erstattetAv.kode
                );
                if (publishedCurriculum) {
                  curriculumReference.push({
                    code: publishedCurriculum.code,
                    title: publishedCurriculum.title,
                  });
                }
              }
            }
          } catch (error) {
            console.error(
              `Kunne ikke lese eller parse filen for læreplan ${laereplanKode}:`,
              error
            );
          }
          // Kaster error hvis det er en som har grep-type laereplan-lk20
        } else if (grepType === "laereplan-lk20") {
          console.warn(
            "LK-20 læreplan med laereplan-referanser og ikke tilhoerer-laereplan"
          );
        }
      }
    } else if (fileData["laereplan-referanser"]) {
      console.error("laereplan-referanser er ikke en array");
    } else if (Array.isArray(fileData["tilhoerer-laereplan"])) {
      curriculumReference = [];

      for (const curriculum of fileData["tilhoerer-laereplan"]) {
        if (
          curriculum.status ===
          "https://data.udir.no/kl06/v201906/status/status_publisert"
        ) {
          const curriculumCode = curriculum.kode;
          const curriculumFilePath = `${COMBINED_CURRICULUM_PATH}/${curriculumCode}.json`;

          // Les læreplanfilen for å hente tittel
          const curriculumData = JSON.parse(
            await promises.readFile(curriculumFilePath, "utf8")
          );
          const title = curriculumData.tittel.tekst.reduce(
            (acc: any, item: any) => {
              acc[item.spraak] = item.verdi; // Sett verdi basert på språket
              return acc;
            },
            {} as Title
          );

          // Fjern tomme strenger
          Object.keys(title).forEach((key) => {
            if (title[key as keyof Title] === "") {
              delete title[key as keyof Title];
            }
          });

          curriculumReference.push({
            code: curriculumCode,
            title: title,
          });
        }
      }
    } else if (fileData["tilhoerer-laereplan"]) {
      const curriculumCode = fileData["tilhoerer-laereplan"].kode;
      const curriculumFilePath = `${COMBINED_CURRICULUM_PATH}/${curriculumCode}.json`;

      // Les læreplanfilen for å hente tittel
      const curriculumData = JSON.parse(
        await promises.readFile(curriculumFilePath, "utf8")
      );
      const title = curriculumData.tittel.tekst.reduce(
        (acc: any, item: any) => {
          acc[item.spraak] = item.verdi; // Sett verdi basert på språket
          return acc;
        },
        {} as Title
      );

      // Fjern tomme strenger
      Object.keys(title).forEach((key) => {
        if (title[key as keyof Title] === "") {
          delete title[key as keyof Title];
        }
      });

      curriculumReference = [
        {
          code: curriculumCode,
          title: title,
        },
      ];
    }

    // Tilknyttede Tverrfaglige Temaer
    let connected_cross_curricular_themes: CrossCurricularThemes[] | null = [];
    if (Array.isArray(fileData["tilknyttede-tverrfaglige-temaer"])) {
      for (const tverrfagligeTemaer of fileData[
        "tilknyttede-tverrfaglige-temaer"
      ]) {
        const grepType = tverrfagligeTemaer.referanse["grep-type"]?.replace(
          "http://psi.udir.no/ontologi/kl06/",
          ""
        );
        const status = tverrfagligeTemaer.referanse.status?.replace(
          "https://data.udir.no/kl06/v201906/status/status_",
          ""
        );

        if (grepType === "tverrfaglig_tema_lk20" && status === "publisert") {
          const tverrfagligKode = tverrfagligeTemaer.referanse.kode;
          const TVERRFAGLIGE_TEMAER_PATH = `${FILES_PATH}/tverrfaglige-temaer-lk20/${tverrfagligKode}.json`;
          try {
            const tverrfagligData = JSON.parse(
              await promises.readFile(TVERRFAGLIGE_TEMAER_PATH, "utf8")
            );
            const title = tverrfagligData.tittel.reduce(
              (acc: any, item: any) => {
                acc[item.spraak] = item.verdi; // Sett verdi basert på språket
                return acc;
              },
              {} as Title
            );

            // Fjern tomme strenger
            Object.keys(title).forEach((key) => {
              if (title[key as keyof Title] === "") {
                delete title[key as keyof Title];
              }
            });

            // Legg til tverrfaglig tema i listen
            connected_cross_curricular_themes.push({
              code: tverrfagligKode,
              title: title,
            });
          } catch (error) {
            console.error(
              `Kunne ikke lese eller parse filen for tverrfaglig tema ${tverrfagligKode}:`,
              error
            );
          }
        } else if (grepType === "tverrfaglig_tema" && status === "publisert") {
          throw new Error("Publisert Lk-06");
        }
      }
    } else if (fileData["tilknyttede-tverrfaglige-temaer"]) {
      throw new Error("tilknyttede-tverrfaglige-temaer er ikke en array");
    }

    // Tilknyttede Kjerneelementer
    let connected_core_subjects: CoreSubjects[] | null = [];
    if (Array.isArray(fileData["tilknyttede-kjerneelementer"])) {
      for (const kjerneelementer of fileData["tilknyttede-kjerneelementer"]) {
        const grepType = kjerneelementer.referanse["grep-type"]?.replace(
          "http://psi.udir.no/ontologi/kl06/",
          ""
        );
        const status = kjerneelementer.referanse.status?.replace(
          "https://data.udir.no/kl06/v201906/status/status_",
          ""
        );

        if (grepType === "kjerneelement_lk20" && status === "publisert") {
          const kjerneelementKode = kjerneelementer.referanse.kode;
          const KJERNEELEMENTER_PATH = `${FILES_PATH}/kjerneelementer-lk20/${kjerneelementKode}.json`;
          try {
            const kjerneelementData = JSON.parse(
              await promises.readFile(KJERNEELEMENTER_PATH, "utf8")
            );
            const title = kjerneelementData.tittel.tekst.reduce(
              (acc: any, item: any) => {
                acc[item.spraak] = item.verdi; // Sett verdi basert på språket
                return acc;
              },
              {} as Title
            );

            // Fjern tomme strenger
            Object.keys(title).forEach((key) => {
              if (title[key as keyof Title] === "") {
                delete title[key as keyof Title];
              }
            });

            // Legg til tverrfaglig tema i listen
            connected_core_subjects.push({
              code: kjerneelementKode,
              title: title,
            });
          } catch (error) {
            console.error(
              `Kunne ikke lese eller parse filen for tverrfaglig tema ${kjerneelementKode}:`,
              error
            );
          }
        } else if (grepType === "tverrfaglig_tema" && status === "publisert") {
          throw new Error("Publisert Lk-06");
        }
      }
    } else if (fileData["tilknyttede-kjerneelementer"]) {
      throw new Error("Tilknyttede Kjerneelementer er ikke en Array");
    }

    // Tilknyttede Fagkodereferanse og Opplaeringsfagreferanse
    let subject_code_reference: SubjectCodeReference[] | null = [];
    let educational_subject_reference: EducationalSubjectReference[] | null =
      [];
    if (fileData["tilhoerer-kompetansemaalsett"]) {
      const kompetansemaalsettKode =
        fileData["tilhoerer-kompetansemaalsett"].kode;
      const COMPETENCE_GOAL_SET_PATH = `${COMBINED_COMPETENCE_GOAL_SETS_PATH}/${kompetansemaalsettKode}.json`;
      try {
        const kompetansemaalsettData = JSON.parse(
          await promises.readFile(COMPETENCE_GOAL_SET_PATH, "utf8")
        );

        for (const opplaeringsfag of kompetansemaalsettData["etter-fag"]) {
          const grepType = opplaeringsfag["grep-type"]?.replace(
            "http://psi.udir.no/ontologi/kl06/",
            ""
          );
          const status = opplaeringsfag.status?.replace(
            "https://data.udir.no/kl06/v201906/status/status_",
            ""
          );

          if (grepType === "opplaeringsfag" && status === "publisert") {
            const opplaeringsfagKode = opplaeringsfag.kode;
            const EDUCATIONAL_SUBJECTS_PATH = `${FILES_PATH}/opplaeringsfag/${opplaeringsfagKode}.json`;
            try {
              const opplaeringsfagData = JSON.parse(
                await promises.readFile(EDUCATIONAL_SUBJECTS_PATH, "utf8")
              );

              const title = opplaeringsfagData.tittel.reduce(
                (acc: any, item: any) => {
                  acc[item.spraak] = item.verdi; // Sett verdi basert på språket
                  return acc;
                },
                {} as Title
              );

              // Fjern tomme strenger
              Object.keys(title).forEach((key) => {
                if (title[key as keyof Title] === "") {
                  delete title[key as keyof Title];
                }
              });

              // Legg til tverrfaglig tema i listen
              educational_subject_reference.push({
                code: opplaeringsfagKode,
                title: title,
              });

              if (Array.isArray(opplaeringsfagData["fagkode-referanser"])) {
                for (const fagkode of opplaeringsfagData[
                  "fagkode-referanser"
                ]) {
                  const grepType = fagkode["grep-type"].replace(
                    "http://psi.udir.no/ontologi/kl06/",
                    ""
                  );
                  const status = fagkode.status.replace(
                    "https://data.udir.no/kl06/v201906/status/status_",
                    ""
                  );

                  // subject_code_reference
                  if (grepType === "fagkode" && status === "publisert") {
                    const fagkodeKode = fagkode.kode;
                    const SUBJECT_CODES_PATH = `${FILES_PATH}/fagkoder/${fagkodeKode}.json`;
                    try {
                      const fagkodeData = JSON.parse(
                        await promises.readFile(SUBJECT_CODES_PATH, "utf8")
                      );
                      const title = fagkodeData.tittel.reduce(
                        (acc: any, item: any) => {
                          acc[item.spraak] = item.verdi; // Sett verdi basert på språket
                          return acc;
                        },
                        {} as Title
                      );

                      // Fjern tomme strenger
                      Object.keys(title).forEach((key) => {
                        if (title[key as keyof Title] === "") {
                          delete title[key as keyof Title];
                        }
                      });

                      // Legg til tverrfaglig tema i listen
                      subject_code_reference.push({
                        code: fagkodeKode,
                        title: title,
                      });
                    } catch (error) {
                      console.error(
                        `Kunne ikke lese eller parse filen for fagkode ${fagkodeKode}:`,
                        error
                      );
                    }
                  }
                }
              }
            } catch (error) {
              console.error(
                `Kunne ikke lese eller parse filen for opplaeringsfag ${opplaeringsfagKode}:`,
                error
              );
            }
          } else if (
            grepType === "tverrfaglig_tema" &&
            status === "publisert"
          ) {
            throw new Error("Publisert Lk-06");
          }
        }
      } catch (error) {
        console.error(
          `Kunne ikke lese eller parse filen for kompetansemaalsett ${kompetansemaalsettKode}:`,
          error
        );
      }
    } else if (Array.isArray(fileData["laereplan-referanser"])) {
      const referanse = fileData["laereplan-referanser"];

      // Iterer over alle referanser
      for (const ref of referanse) {
        const kompetansemaalsett = ref["tilhoerende-kompetansemaalsett"];

        // Sjekk om kompetansemaalsett er en array og iterer over den
        if (Array.isArray(kompetansemaalsett)) {
          for (const km of kompetansemaalsett) {
            const filePath = `${FILES_PATH}/competence_goal_sets/${km.kode}.json`;
            try {
              const kmpsettFileContent: KmpsettSubType = JSON.parse(
                await promises.readFile(filePath, "utf8")
              );

              if (
                Array.isArray(kmpsettFileContent["etter-fag"]) &&
                kmpsettFileContent["etter-fag"].length > 0
              ) {
                // Iterer over alle elementene i "etter-fag"
                for (const etterFag of kmpsettFileContent["etter-fag"]) {
                  const referanseKode = etterFag.kode;
                  const filePath = `${FILES_PATH}/opplaeringsfag/${referanseKode}.json`;
                  try {
                    const eduFileContent: EduSubType = JSON.parse(
                      await promises.readFile(filePath, "utf8")
                    );
                    if (Array.isArray(eduFileContent["erstattes-av"])) {
                      for (const erstattetAv of eduFileContent[
                        "erstattes-av"
                      ]) {
                        const publishedEducationalSubjects =
                          await fetchPublishedEducationalSubjects(
                            erstattetAv.kode
                          );
                        if (publishedEducationalSubjects) {
                          educational_subject_reference.push({
                            code: publishedEducationalSubjects.code,
                            title: publishedEducationalSubjects.title,
                          });
                        }
                      }
                    }
                    if (Array.isArray(eduFileContent["fagkode-referanser"])) {
                      for (const fagkode of eduFileContent[
                        "fagkode-referanser"
                      ]) {
                        const publishedSubjectCodes =
                          await fetchPublishedSubjectCodes(fagkode.kode);
                        if (publishedSubjectCodes) {
                          subject_code_reference.push({
                            code: publishedSubjectCodes.code,
                            title: publishedSubjectCodes.title,
                          });
                        }
                      }
                    }
                  } catch (error) {
                    console.error(`Kunne ikke lese filen ${filePath}:`, error);
                  }
                }
              }
            } catch (error) {
              console.error(`Kunne ikke lese filen ${filePath}:`, error);
            }
          }
        }
      }
    }

    let id = null;

    const competenceGoalObject: ProcessedCompetenceGoal = {
      // id: id,
      code: fileData.kode,
      title: fullName,
      status: status,
      last_changed: fileData["sist-endret"] || null,
      // competence_goal_set_reference: competenceGoalSetReference,
      // curriculum_reference:
      //   curriculumReference.length > 0 ? curriculumReference : null,
      // connected_cross_curricular_themes:
      //   connected_cross_curricular_themes.length > 0
      //     ? connected_cross_curricular_themes
      //     : null,
      // connected_core_subjects:
      //   connected_core_subjects.length > 0 ? connected_core_subjects : null,
      // educational_subject_reference:
      //   educational_subject_reference.length > 0
      //     ? educational_subject_reference
      //     : null,
      // subject_code_reference:
      //   subject_code_reference.length > 0 ? subject_code_reference : null,
    };
    // Add the curriculum to the set, if it's a high school curriculum
    if (status === "publisert") {
      competenceGoalSet.add(competenceGoalObject);
    }

    // Simulate writing to a database (200-400ms delay)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * (400 - 200 + 1)) + 200)
    );
  }
  // Behandle filer samtidig, med maksimalt 100 om gangen
  await pMap(files, processFile, { concurrency: 100 });

  // Etter at alle filer er behandlet, oppdater den globale variabelen
  competenceGoalData = Array.from(competenceGoalSet);

  // Lagre den behandlede dataen til en JSON-fil
  await promises.writeFile(
    `${PROCESSED_PATH}/competence_goals.json`,
    JSON.stringify(competenceGoalData, null, 2)
  );

  // console.timeLog("Timer", "Competence goal processed");
}

async function useProcessedData() {
  console.log("Antall fagkoder:", subjectCodeData.length);
  console.log("Antall opplæringsfag:", educationalSubjectData.length);
  console.log("Antall læreplaner:", curriculumData.length);
  console.log("Antall kompetansemaalsett:", competenceGoalSetsData.length);
  console.log("Antall kompetansemaal:", competenceGoalData.length);
}

async function fetchPublishedCurriculum(
  curriculumCode: string
): Promise<Record<string, Title> | null> {
  const curriculumFilePath = `${COMBINED_CURRICULUM_PATH}/${curriculumCode}.json`;

  try {
    const curriculumData = JSON.parse(
      await promises.readFile(curriculumFilePath, "utf8")
    );
    // Sjekk status
    if (
      curriculumData.status ===
      "https://data.udir.no/kl06/v201906/status/status_utgaatt"
    ) {
      // console.log("Utgått");
      // Hent "erstattet-av" og kall funksjonen rekursivt
      const replacedBy = curriculumData["erstattes-av"];
      if (Array.isArray(replacedBy) && replacedBy.length > 0) {
        for (const replacement of replacedBy) {
          const result = await fetchPublishedCurriculum(replacement.kode);
          if (result) {
            return result; // Returner første "publisert" læreplan
          }
        }
      }
    } else if (
      curriculumData.status ===
      "https://data.udir.no/kl06/v201906/status/status_publisert"
    ) {
      // console.log("Publisert");
      // Returner koden og tittelen hvis den er "publisert"
      const title = curriculumData.tittel.tekst.reduce(
        (acc: any, item: any) => {
          acc[item.spraak] = item.verdi;
          return acc;
        },
        {} as Title
      );
      return { code: curriculumData.kode, title };
    }
  } catch (error) {
    console.error(
      `Kunne ikke lese eller parse filen for læreplan ${curriculumCode}:`,
      error
    );
  }

  // console.log("Ingen læreplan funnet");
  return null; // Returner null hvis ingen "publisert" læreplan ble funnet
}

async function fetchPublishedEducationalSubjects(
  eduCode: string
): Promise<Record<string, Title> | null> {
  const educationalSubjectFilePath = `${FILES_PATH}/opplaeringsfag/${eduCode}.json`;

  try {
    const eduSubData = JSON.parse(
      await promises.readFile(educationalSubjectFilePath, "utf8")
    );
    // Sjekk status
    if (
      eduSubData.status ===
      "https://data.udir.no/kl06/v201906/status/status_utgaatt"
    ) {
      // console.log("Utgått");
      // Hent "erstattet-av" og kall funksjonen rekursivt
      const replacedBy = eduSubData["erstattes-av"];
      if (Array.isArray(replacedBy) && replacedBy.length > 0) {
        for (const replacement of replacedBy) {
          const result = await fetchPublishedEducationalSubjects(
            replacement.kode
          );
          if (result) {
            return result; // Returner første "publisert" læreplan
          }
        }
      }
    } else if (
      eduSubData.status ===
      "https://data.udir.no/kl06/v201906/status/status_publisert"
    ) {
      // console.log("Publisert");
      // Returner koden og tittelen hvis den er "publisert"
      const title = eduSubData.tittel.reduce((acc: any, item: any) => {
        acc[item.spraak] = item.verdi;
        return acc;
      }, {} as Title);
      return { code: eduSubData.kode, title };
    }
  } catch (error) {
    console.error(
      `Kunne ikke lese eller parse filen for opplaeringsfag ${eduCode}:`,
      error
    );
  }

  // console.log("Ingen opplaeringsfag funnet");
  return null; // Returner null hvis ingen "publisert" læreplan ble funnet
}

async function fetchPublishedSubjectCodes(
  fagkode: string
): Promise<Record<string, Title> | null> {
  const subjectCodeFilePath = `${FILES_PATH}/fagkoder/${fagkode}.json`;

  try {
    const fagkodeData = JSON.parse(
      await promises.readFile(subjectCodeFilePath, "utf8")
    );
    // Sjekk status
    if (
      fagkodeData.status ===
      "https://data.udir.no/kl06/v201906/status/status_utgaatt"
    ) {
      // console.log("Utgått");
      // Hent "erstattet-av" og kall funksjonen rekursivt
      const replacedBy = fagkodeData["erstattes-av"];
      if (Array.isArray(replacedBy) && replacedBy.length > 0) {
        for (const replacement of replacedBy) {
          const result = await fetchPublishedSubjectCodes(replacement.kode);
          if (result) {
            return result; // Returner første "publisert" læreplan
          }
        }
      }
    } else if (
      fagkodeData.status ===
      "https://data.udir.no/kl06/v201906/status/status_publisert"
    ) {
      // console.log("Publisert");
      // Returner koden og tittelen hvis den er "publisert"
      const title = fagkodeData.tittel.reduce((acc: any, item: any) => {
        acc[item.spraak] = item.verdi;
        return acc;
      }, {} as Title);
      return { code: fagkodeData.kode, title };
    }
  } catch (error) {
    console.error(
      `Kunne ikke lese eller parse filen for fagkode ${fagkode}:`,
      error
    );
  }

  // console.log("Ingen fagkoder funnet");
  return null; // Returner null hvis ingen "publisert" læreplan ble funnet
}

async function fetchConnectedSubjectsAndEducationalSubjects() {
  // Putt inn Subjects og Educational Subjects her
  type FileContentSubjects = {
    id: string;
    opplaeringsfag: Record<string, string>[] | null;
  };

  type FileContentEduSubjects = {
    id: string;
    "fagkode-referanser": { kode: string; status: string }[];
  };

  const SUBJECT_CODES_PATH = `${FILES_PATH}/fagkoder`;
  const EDUCATIONAL_SUBJECTS_PATH = `${FILES_PATH}/opplaeringsfag`;
}

start();
