import path from 'node:path';
import asar from '@electron/asar';

export function extractBundledFile(archive,relative,reader=asar,paths=path){
  // ASAR traverses directories using the host separator, including on Windows.
  return reader.extractFile(archive,paths.normalize(relative));
}
