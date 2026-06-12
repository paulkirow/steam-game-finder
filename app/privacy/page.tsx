export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-white mb-6">Privacy Policy</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-slate-300">
        <section>
          <h2 className="text-lg font-semibold text-white mb-2">
            What data is collected
          </h2>
          <p>
            Steam Game Finder fetches the following data from Steam&apos;s
            public APIs only when you explicitly submit Steam IDs:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-slate-400">
            <li>Steam profile information (persona name, avatar, visibility)</li>
            <li>
              Game library contents (app IDs and names) for public profiles
            </li>
            <li>Friends list (Steam ID list only) for public profiles</li>
            <li>Game metadata (name, tags, categories, scores)</li>
          </ul>
          <p className="mt-2">
            No Steam passwords, login tokens, or private information are
            accessed. We use only Steam&apos;s public Web API.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">
            How data is stored
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-slate-700">
                <th className="py-2 pr-4 font-medium text-slate-300">Data</th>
                <th className="py-2 pr-4 font-medium text-slate-300">Where</th>
                <th className="py-2 font-medium text-slate-300">Duration</th>
              </tr>
            </thead>
            <tbody className="text-slate-400">
              {[
                ["Game library (appids + names)", "Cloudflare KV", "24 hours"],
                [
                  "User profile (name, avatar, visibility)",
                  "Cloudflare KV",
                  "24 hours",
                ],
                ["Friends list (IDs only)", "Cloudflare KV", "1 hour"],
                [
                  "Resolved SteamID64 + profile",
                  "Cloudflare D1 (SQLite)",
                  "Until purged",
                ],
                [
                  "Game metadata (tags, score, categories)",
                  "Cloudflare D1 (SQLite)",
                  "Refreshed weekly",
                ],
              ].map(([data, where, duration]) => (
                <tr key={data} className="border-b border-slate-800">
                  <td className="py-2 pr-4">{data}</td>
                  <td className="py-2 pr-4">{where}</td>
                  <td className="py-2">{duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-slate-500 text-xs">
            All Cloudflare infrastructure is US-based.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">
            How data is used
          </h2>
          <p>
            Cached data is used solely to reduce redundant Steam API calls and
            speed up comparisons for returning users. It is never sold, shared
            with third parties, or used for marketing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">
            Third-party services
          </h2>
          <p>
            This app uses the{" "}
            <a
              href="https://steamcommunity.com/dev"
              className="text-blue-400 hover:underline"
            >
              Steam Web API
            </a>{" "}
            (Valve Corporation) and{" "}
            <a
              href="https://steamspy.com"
              className="text-blue-400 hover:underline"
            >
              SteamSpy
            </a>{" "}
            for game metadata. Use of these services is subject to their
            respective terms.
          </p>
          <p className="mt-2">
            Steam Game Finder is not affiliated with or endorsed by Valve
            Corporation.
          </p>
        </section>
      </div>
    </main>
  );
}
