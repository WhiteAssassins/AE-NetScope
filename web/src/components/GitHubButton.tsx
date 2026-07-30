import { GitFork, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchRepositoryInfo } from "../api";
import type { RepositoryInfo } from "../types";

const REPOSITORY_URL = "https://github.com/WhiteAssassins/AE-NetScope";

export default function GitHubButton() {
  const { t } = useTranslation();
  const [repository, setRepository] = useState<RepositoryInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetchRepositoryInfo()
      .then((data) => {
        if (active) setRepository(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const count = repository?.stargazers_count;
  const label =
    count === undefined
      ? t("github.openRepository")
      : t("github.openRepositoryWithStars", { count });

  return (
    <a
      aria-label={label}
      className="github-nav-action"
      href={repository?.html_url ?? REPOSITORY_URL}
      rel="noreferrer"
      target="_blank"
      title={label}
    >
      <GitFork aria-hidden="true" size={20} strokeWidth={1.9} />
      <span>{t("github.label")}</span>
      <span className="github-stars">
        <Star aria-hidden="true" size={15} strokeWidth={2} />
        {count === undefined ? t("github.star") : count.toLocaleString()}
      </span>
    </a>
  );
}
