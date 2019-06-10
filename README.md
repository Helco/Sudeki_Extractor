# Sudeki Extractor

This is (or was) a short experiment to extract the game archives of Sudeki and parse some of its files.
Most likely I will not continue this much further, feel free to take over :)

## Current state

The node.js script can extract archives.
It uses a regex to find filenames in the archive and other files for a partial mapping.
Because every archive is version 4 (as by the magic value) the used checksum method is alternating multiplication and addition (see below).

Out of the files with names there are 2658 with a object-like content.
The script can parse these (mostly in a very hacky way) and outputs JSON.

HOM seems to be models (at least mesh, skin and animations, possibly: material info, shader attributes)
XWB/XSB should be XACT files, but I didn't check

## Checksum method

There are other checksum methods in the executable but the baf archives all use the following pseudocode.
The first byte is used for the bucket selection of the baf archive.

```
uint8* bytes = to_upper_case(filename)
uint32 checksum = 0;
for (int i = 0; i < length; i++) {
    if (i % 2 == 0)
        checksum += bytes[i];
    else
        checksum *= bytes[i];
}
```
