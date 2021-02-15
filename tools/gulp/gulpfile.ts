import * as del from 'del';
import * as fs from 'fs';
import { dest, series, src, task } from 'gulp';
import * as clean from 'gulp-clean';
import run from 'gulp-run-command';
import { createProject } from 'gulp-typescript';

// --------------------------------------------------------------------------
//
//  Properties
//
// --------------------------------------------------------------------------

const input = `src`;
const output = `dist`;

const project = createProject(`tsconfig.json`);
const projectDirectory = project.projectDirectory;

// --------------------------------------------------------------------------
//
//  Files Methods
//
// --------------------------------------------------------------------------

const filesDelete = async (files: Array<string>, options?: any): Promise<void> => {
    await new Promise(resolve => {
        src(files, options || { read: false })
            .pipe(clean())
            .on('finish', resolve);
    });
};

const filesCopy = async (files: Array<string>, destination: string, options?: any): Promise<void> => {
    await new Promise(resolve => {
        src(files, options || { allowEmpty: true })
            .pipe(dest(destination))
            .on('finish', resolve);
    });
};

const isFileExist = async (file: string): Promise<boolean> => {
    return new Promise(resolve => fs.exists(file, value => resolve(value)));
};

// --------------------------------------------------------------------------
//
//  Package Methods
//
// --------------------------------------------------------------------------

const nodeModulesClean = async (directory: string): Promise<void> => {
    await del([`${directory}/node_modules`, `${directory}/package-lock.json`], { force: true });
};

const packageClean = async (): Promise<void> => {
    // Remove node_modules
    await nodeModulesClean(input);

    // Remove compiled files
    await filesDelete([
        `${input}/**/*.js`,
        `${input}/**/*.d.ts`,
        `${input}/**/*.js.map`,
        `${input}/**/*.d.ts.map`,
        `!${input}/**/package.json`,
        `!${input}/**/node_modules/**/*`
    ]);
};

const packageCompile = async (): Promise<void> => {
    await new Promise(resolve => {
        project
            .src()
            .pipe(project())
            .pipe(dest(output))
            .on('finish', resolve);
    });
};

const packageUpdateDependencies = async (): Promise<void> => {
    try {
        if (await isFileExist(`package-lock.json`)) {
            await run(`npm update`)();
        } else {
            await run(`npm install`)();
        }
    } catch (error) {}
};

const packageCommit = async (): Promise<void> => {
    await run(`git commit -a -m "auto commit"`)();
};

const packageBuild = async (): Promise<void> => {
    // Update dependencies or install it
    await packageUpdateDependencies();
    // Remove output directory
    await del(output, { force: true });
    // Format and fix code
    await run(`prettier --write ${input}/**/*.{ts,js,json}'`)();
    // Compile project
    await packageCompile();
    // Copy files
    await filesCopy([`${projectDirectory}/package.json`, `!${projectDirectory}/node_modules/**/*`], output);
};

const packageLink = async (): Promise<void> => {
    // Build package or copy files
    await packageBuild();
    // Copy package.js
    await filesCopy([`${projectDirectory}/package.json`], output);
    // Link in npm
    await run(`npm --prefix ${output} link`)();
};

const packagePublish = async (type: 'patch' | 'minor' | 'major'): Promise<void> => {
    // Build package or copy files
    await packageBuild();
    // Commit project
    await packageCommit();
    // Update version of package.js
    await run(`npm --prefix ${projectDirectory} version ${type}`)();
    // Copy package.js
    await filesCopy([`${projectDirectory}/package.json`], output);
    // Publish to npm
    await run(`npm --prefix ${output} --access public publish ${output}`)();
};

(() => {
    task(`link`, () => packageLink());
    task(`build`, () => packageBuild());
    task(`clean`, () => packageClean());
    task(`compile`, () => packageCompile());

    task(`publish:patch`, () => packagePublish('patch'));
    task(`publish:minor`, () => packagePublish('minor'));
    task(`publish:major`, () => packagePublish('major'));
    task(`publish`, series(`publish:patch`));
})();
