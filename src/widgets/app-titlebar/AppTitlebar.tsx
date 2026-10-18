import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { WindowControls } from "@/features/app-titlebar/window-controls";

const HIDE_DELAY = 150;

export const AppTitlebar = () => {
  const [visible, setVisible] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = () => {
    clearTimeout(hideTimeout.current);
    setVisible(true);
  };

  const hide = () => {
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setVisible(false), HIDE_DELAY);
  };

  useEffect(() => () => clearTimeout(hideTimeout.current), []);

  return (
    // min-h-1 keeps a 4px strip at the top edge that opens the bar on hover.
    <div
      className="relative min-h-1 shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <motion.div
        initial={false}
        animate={{ height: visible ? "auto" : 0 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="overflow-hidden"
      >
        <div
          data-tauri-drag-region
          className="flex w-full select-none items-center justify-between"
        >
          <span />
          <WindowControls />
        </div>
      </motion.div>
    </div>
  );
};
