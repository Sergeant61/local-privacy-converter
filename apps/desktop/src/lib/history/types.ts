export interface ConversionRecord {
  id?: number;
  timestamp: number;
  inputFilename: string;
  inputExt: string;
  outputFilename: string;
  outputExt: string;
  outputPath: string;
  targetProfileId: string;
  status: "success" | "error";
  errorMessage?: string;
}
