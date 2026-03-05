declare module "socialblade-com-api" {
  interface TableRow {
    date: string;
    followersDelta: number;
    followers: number;
    followingDelta: number;
    following: number;
    postsDelta: number;
    posts: number;
  }

  interface ChartEntry {
    date: string;
    value: number;
  }

  interface Chart {
    id: string;
    title: string;
    data: ChartEntry[];
  }

  interface SocialBladeResult {
    table: TableRow[];
    charts: Chart[];
  }

  export function socialblade(
    source: string,
    username: string,
    cookie?: string,
  ): Promise<SocialBladeResult>;
}
