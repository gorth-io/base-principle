// Archived implementation retained for reference.
// import type { RequestHandler } from "express";
// import bodyParser from "body-parser";
// // import type {
// //   Options,
// //   // OptionsJson,
// //   OptionsText,
// //   // OptionsUrlencoded,
// // } from "body-parser";
//
// export const bodyParserConfig = (
//   options: {
//     limit?: string;
//     extended?: boolean;
//     // json?: OptionsJson;
//     // urlencoded?: OptionsUrlencoded;
//     // raw?: Options;
//     // text?: OptionsText;
//     // enableRaw?: boolean;
//     // enableText?: boolean;
//   } = {},
// ): RequestHandler[] => {
//   const {
//     limit = "50mb",
//     extended = false,
//     // raw = undefined,
//     // text = undefined,
//   } = options
//
//   // const bodyParserOptions: RequestHandler[] =
//
//   return [
//     bodyParser.json({
//       limit
//     }),
//
//     bodyParser.urlencoded({
//       limit,
//       extended,
//       // ...urlencoded,
//     }),
//
//     // bodyParser.raw({
//     //   limit,
//     //   ...raw,
//     // }),
//     //
//     // bodyParser.text({
//     //   limit,
//     //   ...text,
//     // }),
//   ];
// };
//
// // export const bodyParserConfig = ({
// //   limit = "50mb",
// //   extended = false,
// // }: {
// //   limit?: string;
// //   extended?: boolean;
// // }): RequestHandler[] => {
// //   return [
// //     bodyParser.json({ limit }),
// //     bodyParser.urlencoded({ extended, limit }),
// //     // bodyParser.json({ limit: "50mb" }),
// //     // bodyParser.urlencoded({ extended: false, limit: "50mb" }),
// //     // bodyParser.raw({ limit: "50mb" }),
// //   ];
// //
// //   // app.use(bodyParser.json())
// //   // app.use(
// //   //   bodyParser.urlencoded({
// //   //     extended: false,
// //   //   })
// //   // )
// //   // bodyParser({
// //   //   json: true,
// //   //   urlencoded: {
// //   //     extended: false,
// //   //   }
// //   // })
// // }
