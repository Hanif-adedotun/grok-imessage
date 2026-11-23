export type LogFn = (event: string, fields?: Record<string, unknown>) => void;

export const consoleLog: LogFn = (event, fields) => {
  if (fields && Object.keys(fields).length > 0) {
    console.log(JSON.stringify({ event, ...fields }));
  } else {
    console.log(JSON.stringify({ event }));
  }
};
