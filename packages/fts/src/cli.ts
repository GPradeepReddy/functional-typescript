#!/usr/bin/env node

import program from 'commander'
import { generateDefinition } from '.'

export async function exec(argv: string[]) {
  program
    .name('fts')
    .usage('[options] <file.ts>')
    .option('-p, --project <project>', "Path to 'tsconfig.json'.")
    .parse(argv)

  let file: string
  if (program.args.length === 1) {
    file = program.args[0]
  } else {
    console.error('invalid arguments')
    program.help()
    process.exit(1)
  }

  const definition = await generateDefinition(file)
  console.log(JSON.stringify(definition, null, 2))
}

exec(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
