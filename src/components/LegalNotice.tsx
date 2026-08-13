import { COPYRIGHT_HOLDER, LICENSE_URL, SOURCE_LINK_LABEL, SOURCE_VERSION_URL } from "../config/pricing";

export function LegalNotice() {
  return (
    <div className="legal-notice">
      <p>
        Copyright © 2026 {COPYRIGHT_HOLDER}. Akkivo is free software: you may redistribute and/or modify it under GNU
        AGPL v3.0 only. It is provided without warranty.
      </p>
      <nav aria-label="Legal and source links">
        <a href={LICENSE_URL}>Licence</a>
        <a href={SOURCE_VERSION_URL} rel="noreferrer" target="_blank">
          {SOURCE_LINK_LABEL}
        </a>
        <a href="/THIRD_PARTY_NOTICES.txt">Third-party notices</a>
      </nav>
    </div>
  );
}
