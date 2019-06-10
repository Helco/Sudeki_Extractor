const fs = require("fs");
const path = require("path");

const archives = [
    "controller.baf",
    "Fonts.baf",
    "SOLData.baf"
];
const nameFiles = [
    "Sudeki.exe",
    "Data/SOLWORLDM.gex",
    "Data/WINSOLM.fubi",
    "Data/WINSOLM.gex"
];
const solExtensions = [
    "SOL", "ANI",
    "QUESTLOG.MAO",
    "RUNES.MAO",
    "COMBATGLOBALS.DAT"
];
const filenameRegex = /\W([\w\-]{3,}\.[a-zA-Z]{3})\W/g;
const outputDir = "output/";
const parsedDir = "parsed/";

// Main
console.log("Load archives and name files...");
const archivesData = archives.map(name => fs.readFileSync(name));
const nameFilesData = archivesData.concat(nameFiles.map(name => fs.readFileSync(name)));

console.log("Search for filenames...");
const filenames = new Set();
for (const nameFileData of nameFilesData) {
    let nameFileString = nameFileData.toString("latin1"); // UTF8 might garble the bytes
    let results = filenameRegex.exec(nameFileString);
    while (results !== null) {
        filenames.add(results[1].toUpperCase());
        results = filenameRegex.exec(nameFileString);
    }
}

console.log(`Found ${filenames.size} filenames, calculate checksums...`);
const filenameChecksums = new Map();
for (const filename of filenames) {
    const filenameData = Buffer.from(filename, "latin1");
    let checksum = 0;
    let useMultiplication = false;
    for (const byte of filenameData) {
        if (useMultiplication)
            checksum *= byte;
        else
            checksum += byte;
        checksum = checksum >>> 0;
        useMultiplication = !useMultiplication;
    }
    if (filenameChecksums.has(checksum))
        throw new Error("Checksum collision");
    filenameChecksums.set(checksum, filename);
}

console.log("Extract archives...");
try { fs.mkdirSync(outputDir); } catch {}
const HEADER_OFFSET = 2060;
for (const archiveData of archivesData) {
    const archiveSize = archiveData.length;
    const tableOffset = archiveData.readUInt32LE(archiveSize - HEADER_OFFSET + 4);

    // Read file entries
    let files = [];
    let curOffset = archiveSize - HEADER_OFFSET - tableOffset;
    for (let i = 0; i < 256; i++) {
        const bucketSize = archiveData.readUInt32LE(curOffset);
        curOffset += 4;
        for (let entryI = 0; entryI < bucketSize; entryI++) {
            files.push({
                offset: archiveData.readUInt32LE(curOffset + 0),
                size: archiveData.readUInt32LE(curOffset + 4),
                nameChecksum: archiveData.readUInt32LE(curOffset + 8)
            });
            curOffset += 12;
        }
    }

    console.log(`Extracting ${files.length} files...`);
    for (const file of files) {
        let filename;
        if (filenameChecksums.has(file.nameChecksum))
            filename = filenameChecksums.get(file.nameChecksum);
        else
            filename = "0noname_" + file.nameChecksum.toString(16);

        fs.writeFileSync(path.join(outputDir, filename), archiveData.slice(file.offset, file.offset + file.size));
    }
}

// free memory (or have the chance to)
archivesData.splice(0);
nameFilesData.splice(0);

console.log("Search for SOL (or similar) files...");
const solFiles = Array.from(filenames.values()).filter(name => solExtensions.find(ext => name.endsWith(ext)) != null);

console.log(`Parsing ${solFiles.length} SOL files...`);
let successCount = 0;
try { fs.mkdirSync(parsedDir); } catch {}
for (const filename of solFiles) {
    let data;
    try { data = fs.readFileSync(path.join(outputDir, filename)); } catch { continue; }

    let curOffset = 0;
    const parseString = () => {
        let res = "";
        let curChar;
        do {
            curChar = data.readUInt8(curOffset++);
            res += String.fromCharCode(curChar);
        } while (curChar != 0);
        return res.slice(0, -1);
    }
    const parseObject = (into) => {
        const startOffset = curOffset;
        let size = data.readUInt32LE(curOffset);
        curOffset += 4;
        const hasNoChild = (size & 0x80000000) != 0;
        size = size & 0x7FFFFFFF;
        const name = parseString();
        const restSize = size - 4 - name.length - 1;

        let value;
        let children = {};
        if (restSize == 1)
            value = data.readUInt8(curOffset++);
        else if (restSize == 4) {
            value = data.readUInt32LE(curOffset);
            curOffset += 4;
        }
        else if (hasNoChild) {
            value = parseString();
            if (curOffset - startOffset + 4 === size) {
                value = { string: value, value: data.readUInt32LE(curOffset) };
                curOffset += 4;
            }
            else
                curOffset = startOffset + size;
        }
        else while (curOffset - startOffset < size) {
            parseObject(children);
        }

        if (curOffset - startOffset !== size)
            throw new Error("Invalid SOL parsing");
        if (name in into)
            throw new Error("Child name collision");

        into[name] = value === undefined ? children : value;
    };

    let objects = {};
    while (curOffset < data.length)
        parseObject(objects);

    fs.writeFileSync(path.join(parsedDir, filename + ".json"), JSON.stringify(objects, null, "  "));
    successCount++;
}
console.log(`Only ${successCount} survived...`);
