import { organizeFiles } from "./history-files";
self.onmessage = async (e: MessageEvent<File[]>) => {
  try {
    const review = await organizeFiles(e.data, (events, files) =>
      self.postMessage({ events, files }),
    );
    self.postMessage({ review });
  } catch (err) {
    // Libraries may include file content in parser errors. Only display our own diagnostics.
    const m = err instanceof Error ? err.message : "";
    self.postMessage({
      error:
        /^(Choose |The history file is malformed|A history record is too large|Individual history files|The selected history exceeds|Split, ZIP64|This ZIP is incomplete|Unsafe ZIP member|ZIP expansion exceeds|Encrypted or oversized|ZIP member expanded|Incomplete ZIP member|No supported listening history)/.test(
          m,
        )
          ? m
          : "This file could not be read. Check its format and try the original export.",
    });
  }
};
