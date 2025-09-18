declare module 'pdf-image' {
  interface PDFImageOptions {
    convertOptions?: Record<string, any>;
    convertExtension?: string;
    convertArgs?: string[];
    graphicsMagick?: boolean;
    combinedImage?: boolean;
    pdfFileBaseName?: string;
  }

  class PDFImage {
    constructor(filePath: string, options?: PDFImageOptions);
    convertFile(pdfFilePath: string): Promise<string[]>;
    convertPage(pageNumber: number, options?: any): Promise<string>;
    convertPageToImagePath(pdfFilePath: string, pageNumber: number, options?: any): Promise<string>;
    numberOfPages(): Promise<number>;
    setConvertExtension(convertExtension: string): void;
    setConvertOptions(convertOptions: Record<string, any>): void;
    setConvertArgs(convertArgs: string[]): void;
    setOutputDirectory(outputDirectory: string): void;
    setOutputImageNameForPage(pageNumber: number, imageName: string): void;
    static convert(pdfFilePath: string, options?: PDFImageOptions): Promise<string[]>;
  }

  export = PDFImage;
}
