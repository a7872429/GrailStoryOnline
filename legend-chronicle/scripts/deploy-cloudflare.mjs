import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const required=["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_D1_DATABASE_ID"];
const missing=required.filter(name=>!process.env[name]);
if(missing.length)throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);

execFileSync("npm",["run","build"],{stdio:"inherit"});
const configPath=resolve("dist/server/wrangler.json");
const config=JSON.parse(readFileSync(configPath,"utf8"));
const databaseName="legend-chronicle-db";
config.name=process.env.CLOUDFLARE_WORKER_NAME||"legend-chronicle";
config.d1_databases=[{binding:"DB",database_name:databaseName,database_id:process.env.CLOUDFLARE_D1_DATABASE_ID,migrations_dir:resolve("migrations")}];
writeFileSync(configPath,JSON.stringify(config,null,2));

const wrangler=resolve("node_modules/wrangler/bin/wrangler.js");
execFileSync(process.execPath,[wrangler,"d1","migrations","apply",databaseName,"--remote","--config",configPath],{stdio:"inherit"});
execFileSync(process.execPath,[wrangler,"deploy","--config",configPath],{stdio:"inherit"});
