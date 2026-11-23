"use client";

import { MAX_JD_CHARS } from "@/lib/validation";
import { Card, buttonStyles, cx, textareaStyles } from "./ui";

export function JobDescriptionInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Card
      step={2}
      title="Job description"
      description="Paste the complete posting: title, company, responsibilities, requirements, and nice-to-haves."
      actions={
        value ? (
          <button type="button" className={buttonStyles.ghost} onClick={() => onChange("")} disabled={disabled}>
            Clear
          </button>
        ) : null
      }
    >
      <textarea
        className={cx(textareaStyles, "h-[26rem]")}
        value={value}
        maxLength={MAX_JD_CHARS}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Senior Software Engineer at …\n\nAbout the role …\nResponsibilities …\nRequirements …\nNice to have …"}
        disabled={disabled}
        aria-label="Job description"
      />
      <p className="mt-1.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
        {value.length.toLocaleString()} / {MAX_JD_CHARS.toLocaleString()}
      </p>
    </Card>
  );
}
