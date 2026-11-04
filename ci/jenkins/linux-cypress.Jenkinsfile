/* -*- Mode: groovy; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4; fill-column: 100 -*- */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Linux build of Collabora Online that runs the Cypress tests. For now it only prints a message,
// so the job can be set up and run end to end before the real build and test steps are added.

pipeline {
    agent {
        label 'almalinux8-chen-f'
    }

    options {
        timestamps()
        timeout(time: 4, unit: 'HOURS')
    }

    stages {
        stage('Gerrit parameters') {
            steps {
                // Print every GERRIT_ variable the Gerrit Trigger plugin passes in.
                sh 'env | grep "^GERRIT_" | sort || true'
            }
        }
        stage('Build') {
            steps {
                echo "Hello, here running Cypress tests on the ${env.GERRIT_BRANCH} branch (linux)"
                sh 'hostname; uname -a'
            }
        }
    }
}
