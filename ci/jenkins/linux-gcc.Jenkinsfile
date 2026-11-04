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

// Linux build of Collabora Online with gcc. For now it only prints a message, so the job can be
// set up and run end to end before the real build steps are added.

pipeline {
    agent {
        label 'oraclelinux7-chen-a'
    }

    options {
        timestamps()
        skipDefaultCheckout()
    }

    stages {
        stage('Gerrit parameters') {
            steps {
                // Print every GERRIT_ variable the Gerrit Trigger plugin passes in.
                sh 'env | grep "^GERRIT_" | sort || true'
            }
        }
        stage('Checkout') {
            steps {
                // Fetch the Gerrit change under test and check out its exact commit. The second
                // refspec keeps main current in the persistent workspace, so each fetch only needs
                // the objects that are new since the last build.
                checkout([$class: 'GitSCM',
                    branches: [[name: env.GERRIT_PATCHSET_REVISION]],
                    userRemoteConfigs: [[
                        name: 'origin',
                        url: 'https://gerrit.collaboraoffice.com/online',
                        refspec: "${env.GERRIT_REFSPEC} +refs/heads/main:refs/remotes/origin/main"
                    ]],
                    extensions: [
                        [$class: 'CloneOption', shallow: false, noTags: true, timeout: 60],
                    ]
                ])
            }
        }
        stage('Build') {
            steps {
                echo "Hello, here building Collabora Online ${env.GERRIT_BRANCH} branch (linux, gcc)"
                sh 'hostname; uname -a'
            }
        }
    }
}
