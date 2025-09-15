#!/usr/bin/env node

/**
 * Test script to verify command line access capabilities for the VS Code extension
 * This addresses Kiro's concern about extensions not having access to command lines
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Command Line Access for VS Code Extension\n');

// Test cases to verify different command execution scenarios
const testCases = [
    {
        name: 'Basic Echo Command',
        command: process.platform === 'win32' ? 'echo "Hello from VSCode Extension"' : 'echo "Hello from VSCode Extension"',
        expectSuccess: true
    },
    {
        name: 'Directory Listing',
        command: process.platform === 'win32' ? 'dir' : 'ls -la',
        expectSuccess: true
    },
    {
        name: 'Node Version Check',
        command: 'node --version',
        expectSuccess: true
    },
    {
        name: 'Python Version Check',
        command: 'python --version',
        expectSuccess: true
    },
    {
        name: 'Git Status (if in git repo)',
        command: 'git status --short',
        expectSuccess: false // May fail if not in git repo
    },
    {
        name: 'NPM Version Check',
        command: 'npm --version',
        expectSuccess: true
    }
];

async function runTest(testCase) {
    return new Promise((resolve) => {
        console.log(`📋 Testing: ${testCase.name}`);
        console.log(`   Command: ${testCase.command}`);

        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd' : 'bash';
        const shellArgs = isWindows ? ['/c', testCase.command] : ['-c', testCase.command];

        const startTime = Date.now();
        const childProcess = spawn(shell, shellArgs, {
            shell: true,
            cwd: __dirname
        });

        let stdout = '';
        let stderr = '';

        childProcess.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        childProcess.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        childProcess.on('close', (code) => {
            const duration = Date.now() - startTime;
            const success = code === 0;

            const result = {
                name: testCase.name,
                command: testCase.command,
                success,
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                duration,
                expected: testCase.expectSuccess
            };

            // Display result
            const statusIcon = success ? '✅' : '❌';
            const expectedIcon = success === testCase.expectSuccess ? '✓' : '⚠️';

            console.log(`   Result: ${statusIcon} ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms) ${expectedIcon}`);

            if (stdout.trim()) {
                console.log(`   Output: ${stdout.trim().split('\n')[0]}${stdout.includes('\n') ? '...' : ''}`);
            }

            if (stderr.trim() && !success) {
                console.log(`   Error: ${stderr.trim().split('\n')[0]}`);
            }

            console.log('');
            resolve(result);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
            childProcess.kill();
            resolve({
                name: testCase.name,
                command: testCase.command,
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: 'Command timed out',
                duration: 10000,
                expected: testCase.expectSuccess
            });
        }, 10000);
    });
}

async function runAllTests() {
    console.log(`Platform: ${process.platform}`);
    console.log(`Node.js: ${process.version}`);
    console.log(`Working Directory: ${__dirname}\n`);

    const results = [];

    // Run tests sequentially
    for (const testCase of testCases) {
        const result = await runTest(testCase);
        results.push(result);
    }

    // Summary
    console.log('📊 Test Summary:');
    console.log('================');

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const unexpected = results.filter(r => r.success !== r.expected).length;

    console.log(`✅ Successful: ${successful}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}`);
    console.log(`⚠️ Unexpected: ${unexpected}/${results.length}`);

    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    console.log(`⏱️ Average Duration: ${avgDuration.toFixed(0)}ms`);

    // Detailed results
    console.log('\n📋 Detailed Results:');
    results.forEach(result => {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        const expected = result.success === result.expected ? '' : ' (UNEXPECTED)';
        console.log(`   ${status} ${result.name}${expected}`);
    });

    // Command line access assessment
    console.log('\n🔍 Command Line Access Assessment:');
    console.log('===================================');

    const basicCommandsWork = results.filter(r =>
        r.name.includes('Echo') || r.name.includes('Directory')
    ).every(r => r.success);

    const toolsAvailable = results.filter(r =>
        r.name.includes('Node') || r.name.includes('NPM')
    ).filter(r => r.success).length;

    if (basicCommandsWork) {
        console.log('✅ Basic command execution: WORKING');
    } else {
        console.log('❌ Basic command execution: FAILED');
    }

    console.log(`✅ Development tools available: ${toolsAvailable}/2`);

    if (results.find(r => r.name.includes('Python'))?.success) {
        console.log('✅ Python access: AVAILABLE');
    } else {
        console.log('⚠️ Python access: LIMITED');
    }

    // Final assessment
    console.log('\n🎯 Final Assessment:');
    if (successful >= 4) {
        console.log('✅ EXCELLENT: Command line access is fully functional');
        console.log('   The VSCode extension can execute commands safely');
    } else if (successful >= 2) {
        console.log('⚠️ PARTIAL: Command line access has some limitations');
        console.log('   The VSCode extension can execute basic commands');
    } else {
        console.log('❌ LIMITED: Command line access is severely restricted');
        console.log('   Consider using terminal integration instead');
    }

    console.log('\n📝 Recommendations for VSCode Extension:');
    console.log('- Use command confirmation dialogs for safety');
    console.log('- Implement command risk assessment');
    console.log('- Provide "Copy to Terminal" fallback option');
    console.log('- Cache tool availability checks');
    if (!results.find(r => r.name.includes('Python'))?.success) {
        console.log('- May need Python path configuration');
    }
}

// Run the tests
runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});