declare module "virtual:email-kit/page" {
  const html: string;
  export default html;
}
declare module "virtual:email-kit/engine" {
  export const Engine: {
    TABLES: string[];
    validRow(table: string, row: unknown): boolean;
  };
}
